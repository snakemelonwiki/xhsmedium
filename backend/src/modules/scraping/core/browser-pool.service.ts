import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { ProfileConfigService, ScrapingAccount } from './profile-config.service';

interface PooledContext {
  ctx: BrowserContext;
  platform: string;
  accountId: string;
  createdAt: number;
}

/**
 * 浏览器池管理器（多账号版）
 *
 * 与旧版的区别：
 *   1. 每个 platform:accountId 组合拥有独立的 persistent context 与 profile 目录。
 *   2. 无配置时 fallback 到默认目录（.playwright-profiles/douyin 和 xiaohongshu），完全兼容旧业务。
 *   3. 上下文健康检测、崩溃残留清理与旧版保持一致。
 */
@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private readonly pools = new Map<string, PooledContext>();
  /** 防止同一 poolKey 并发创建浏览器上下文 */
  private readonly creating = new Map<string, Promise<BrowserContext>>();

  constructor(private readonly profileConfig: ProfileConfigService) {}

  /**
   * 获取或创建指定平台+账号的浏览器上下文。
   * @param platform '抖音' | '小红书'
   * @param accountId 可选；不传使用默认账号
   */
  async acquireContext(platform: string, accountId?: string): Promise<BrowserContext> {
    const account = this.safeGetAccount(platform, accountId);
    const poolKey = this.poolKey(platform, account.id);

    const existing = this.pools.get(poolKey);
    if (existing) {
      const healthy = await this.isHealthy(existing.ctx);
      if (healthy) {
        this.logger.debug(`[BrowserPool] 复用 ${poolKey} 上下文（池命中）`);
        return existing.ctx;
      }
      this.logger.warn(`[BrowserPool] ${poolKey} 上下文已失效，重新创建`);
      await this.closeContextByKey(poolKey);
    }

    // 检查是否已有正在创建的请求
    const creatingPromise = this.creating.get(poolKey);
    if (creatingPromise) {
      this.logger.debug(`[BrowserPool] 等待 ${poolKey} 上下文创建中`);
      return creatingPromise;
    }

    const createPromise = this.doCreateContext(account, poolKey, platform);
    this.creating.set(poolKey, createPromise);
    try {
      return await createPromise;
    } finally {
      this.creating.delete(poolKey);
    }
  }

  /**
   * 释放并关闭指定平台+账号的上下文。
   */
  async releaseContext(platform: string, accountId?: string): Promise<void> {
    const account = this.profileConfig.getAccount(platform, accountId);
    const id = account?.id || accountId || platform;
    await this.closeContext(platform, id);
  }

  /**
   * 进程退出时统一清理
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('[BrowserPool] 进程退出，关闭所有浏览器上下文');
    await this.cleanupAll();
  }

  /**
   * 关闭所有上下文
   */
  async cleanupAll(): Promise<void> {
    for (const [poolKey] of this.pools) {
      await this.closeContextByKey(poolKey);
    }
  }

  /**
   * 获取当前池状态（调试用）
   */
  getStatus(): { platform: string; accountId: string; healthy: boolean; ageMs: number }[] {
    return Array.from(this.pools.values()).map((item) => ({
      platform: item.platform,
      accountId: item.accountId,
      healthy: true, // 不主动检测，避免副作用
      ageMs: Date.now() - item.createdAt,
    }));
  }

  // ── 私有方法 ──

  private poolKey(platform: string, accountId: string): string {
    return `${platform}:${accountId}`;
  }

  private async doCreateContext(account: ScrapingAccount, poolKey: string, platform: string): Promise<BrowserContext> {
    this.ensureProfileDir(account.profileDir);
    this.clearSingletonLocks(account.profileDir);

    // 抖音/小红书暂时使用有头模式便于调试，其余平台保持无头
    const isHeadless = platform !== '小红书' && platform !== '抖音';
    const baseArgs: string[] = [];
    if (platform === '抖音') {
      baseArgs.push('--disable-gpu');
    }
    if (process.platform === 'linux') {
      baseArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
    }

    let ctx: BrowserContext | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.warn(`[BrowserPool] ${poolKey} 浏览器启动失败，额外清理后重试`);
          this.clearSingletonLocks(account.profileDir);
          for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Default/Cookies-journal', 'Default/Network/Cookies-journal']) {
            try { fs.rmSync(path.join(account.profileDir, name), { force: true, recursive: true }); } catch { /* ignore */ }
          }
        }

        this.logger.log(`[BrowserPool] 创建 ${poolKey} 上下文（冷启动，attempt=${attempt + 1}）`);
        const attemptArgs = [...baseArgs];
        if (attempt > 0 && platform === '抖音' && process.platform === 'win32') {
          // Windows 下抖音偶发 GPU/沙箱崩溃，追加 --no-sandbox 兜底
          attemptArgs.push('--no-sandbox');
        }

        ctx = await chromium.launchPersistentContext(account.profileDir, {
          headless: isHeadless,
          viewport: { width: 1440, height: 1100 },
          args: [
            ...(isHeadless ? ['--disable-remote-fonts'] : []),
            ...(platform === '抖音' ? [
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
            ] : []),
            ...attemptArgs,
          ],
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        });

        this.pools.set(poolKey, { ctx, platform, accountId: account.id, createdAt: Date.now() });
        return ctx;
      } catch (err: any) {
        this.logger.warn(`[BrowserPool] ${poolKey} 浏览器上下文启动失败 (attempt=${attempt + 1}): ${err?.message || err}`);
        // 若已创建 ctx 但后续失败，确保关闭以避免僵尸进程
        if (ctx) {
          try { await ctx.close(); } catch { /* ignore */ }
          ctx = null;
        }
        if (attempt === 1) throw err;
      }
    }

    throw new Error(`${poolKey} 浏览器上下文启动失败`);
  }

  private safeGetAccount(platform: string, accountId?: string): ScrapingAccount {
    try {
      const account = this.profileConfig.getAccount(platform, accountId);
      if (account) return account;
    } catch (err: any) {
      this.logger.warn(`[BrowserPool] 获取账号配置失败: ${err?.message || err}`);
    }
    // 兜底：仍然用一个合理的默认 profile 目录，避免进程完全不可用
    const profileRoot = path.dirname(this.profileConfig.getConfigPath());
    const dir = path.join(profileRoot, platform === '抖音' ? 'douyin' : 'xiaohongshu');
    return {
      id: accountId || 'default',
      platform: platform === '抖音' ? 'douyin' : 'xiaohongshu',
      label: '兜底默认账号',
      profileDir: dir,
      enabled: true,
      isDefault: true,
    };
  }

  private async closeContext(platform: string, accountId: string): Promise<void> {
    const poolKey = this.poolKey(platform, accountId);
    await this.closeContextByKey(poolKey);
  }

  private async closeContextByKey(poolKey: string): Promise<void> {
    const item = this.pools.get(poolKey);
    if (!item) return;
    this.pools.delete(poolKey);
    try {
      await item.ctx.close();
    } catch {
      // 忽略关闭错误
    }
  }

  private async isHealthy(ctx: BrowserContext): Promise<boolean> {
    try {
      const pages = ctx.pages();
      if (pages.length > 0) {
        await pages[0].evaluate(() => true);
      }
      return true;
    } catch {
      return false;
    }
  }

  private ensureProfileDir(profileDir: string): void {
    fs.mkdirSync(profileDir, { recursive: true });
    // 浏览器需要 Default 子目录，若不存在则创建
    fs.mkdirSync(path.join(profileDir, 'Default'), { recursive: true });
  }

  private clearSingletonLocks(profileDir: string): void {
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const file = path.join(profileDir, name);
      try { fs.rmSync(file, { force: true, recursive: true }); } catch { /* ignore */ }
    }
  }
}
