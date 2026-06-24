import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { resolveRepoRoot } from '../../../shared/utils/project-paths';

interface PooledContext {
  ctx: BrowserContext;
  platform: string;
  createdAt: number;
}

/**
 * 浏览器池管理器
 *
 * 职责：
 *   1. 为每个平台复用 persistent context（冷启动 1-3s → 复用 0s）
 *   2. 自动清理崩溃残留的 SingletonLock / SingletonCookie / SingletonSocket
 *   3. 检测上下文健康状态（pages() 能否正常调用）
 *   4. 进程退出时统一关闭所有浏览器（避免僵尸进程）
 *
 * 与旧版 metricsFetcher.js 的区别：
 *   - 旧版：全局 `Map<string, BrowserContext>` + 裸函数管理
 *   - 新版：NestJS 单例服务，依赖注入，有生命周期管理
 */
@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private readonly pools = new Map<string, PooledContext>();
  private readonly profileRoot: string;

  constructor() {
    this.profileRoot = this.resolveProfileRoot();
    fs.mkdirSync(this.profileRoot, { recursive: true });
    this.logger.log(`[BrowserPool] profileRoot=${this.profileRoot}`);
  }

  /**
   * 获取或创建指定平台的浏览器上下文
   */
  async acquireContext(platform: string): Promise<BrowserContext> {
    const existing = this.pools.get(platform);
    if (existing) {
      const healthy = await this.isHealthy(existing.ctx);
      if (healthy) {
        this.logger.debug(`[BrowserPool] 复用 ${platform} 上下文（池命中）`);
        return existing.ctx;
      }
      this.logger.warn(`[BrowserPool] ${platform} 上下文已失效，重新创建`);
      await this.closeContext(platform);
    }

    const profileDir = this.getProfileDir(platform);
    this.clearSingletonLocks(profileDir);

    const isHeadless = platform !== '小红书';
    const baseArgs: string[] = [];
    if (platform === '抖音') {
      baseArgs.push('--disable-gpu');
    }
    if (process.platform === 'linux') {
      baseArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.warn(`[BrowserPool] ${platform} 浏览器启动失败，额外清理后重试`);
          this.clearSingletonLocks(profileDir);
          // 更激进地清理可能导致锁定的文件
          for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Default/Cookies-journal', 'Default/Network/Cookies-journal']) {
            try { fs.rmSync(path.join(profileDir, name), { force: true, recursive: true }); } catch { /* ignore */ }
          }
        }

        this.logger.log(`[BrowserPool] 创建 ${platform} 上下文（冷启动，attempt=${attempt + 1}）`);
        const attemptArgs = [...baseArgs];
        if (attempt > 0 && platform === '抖音' && process.platform === 'win32') {
          // Windows 下抖音偶发 GPU/沙箱崩溃，追加 --no-sandbox 兜底
          attemptArgs.push('--no-sandbox');
        }

        const ctx = await chromium.launchPersistentContext(profileDir, {
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

        this.pools.set(platform, { ctx, platform, createdAt: Date.now() });
        return ctx;
      } catch (err: any) {
        this.logger.warn(`[BrowserPool] ${platform} 浏览器上下文启动失败 (attempt=${attempt + 1}): ${err?.message || err}`);
        if (attempt === 1) throw err;
      }
    }

    throw new Error(`${platform} 浏览器上下文启动失败`);
  }

  /**
   * 释放并关闭指定平台的上下文
   */
  async releaseContext(platform: string): Promise<void> {
    await this.closeContext(platform);
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
    for (const [platform] of this.pools) {
      await this.closeContext(platform);
    }
  }

  /**
   * 获取当前池状态（调试用）
   */
  getStatus(): { platform: string; healthy: boolean; ageMs: number }[] {
    return Array.from(this.pools.values()).map((item) => ({
      platform: item.platform,
      healthy: true, // 不主动检测，避免副作用
      ageMs: Date.now() - item.createdAt,
    }));
  }

  // ── 私有方法 ──

  private async closeContext(platform: string): Promise<void> {
    const item = this.pools.get(platform);
    if (!item) return;
    this.pools.delete(platform);
    try {
      await item.ctx.close();
    } catch {
      // 忽略关闭错误
    }
  }

  private async isHealthy(ctx: BrowserContext): Promise<boolean> {
    try {
      // 仅 pages() 不够：进程崩溃时 pages() 可能仍返回旧数组。
      // 与任一页面做一次 evaluate 通信，能真正确认上下文/浏览器是否还活着。
      const pages = ctx.pages();
      if (pages.length > 0) {
        await pages[0].evaluate(() => true);
      }
      return true;
    } catch {
      return false;
    }
  }

  private getProfileDir(platform: string): string {
    return path.join(this.profileRoot, platform === '抖音' ? 'douyin' : 'xiaohongshu');
  }

  private clearSingletonLocks(profileDir: string): void {
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      const file = path.join(profileDir, name);
      try { fs.rmSync(file, { force: true, recursive: true }); } catch { /* ignore */ }
    }
  }

  private resolveProfileRoot(): string {
    const root = resolveRepoRoot(__dirname);
    const profileRoot = path.join(root, '.playwright-profiles');
    fs.mkdirSync(profileRoot, { recursive: true });
    return profileRoot;
  }
}
