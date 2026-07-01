import { Injectable } from '@nestjs/common';
import { ProfileConfigService, ScrapingAccount } from './profile-config.service';

interface AccountFailureRecord {
  consecutiveFailures: number;
  lastFailureAt: number;
}

export interface RotationStatus {
  platform: string;
  lastAccountId: string | null;
  candidates: string[];
  failureCounts: Record<string, { consecutiveFailures: number; lastFailureAt: number | null; blocked: boolean }>;
}

/**
 * 账号轮询与失败切换服务
 *
 * 当前策略：
 *   - 默认 Round-Robin 按顺序循环各候选账号，避免集中使用同一个账号触发风控。
 *   - 单次抓取失败会累加该账号连续失败计数；达到阈值后临时屏蔽一段时间。
 *   - 抓取成功会清零该账号连续失败计数。
 *   - 该服务只保存内存状态，进程重启后重新统计；对失败熔断来说是可接受的。
 */
@Injectable()
export class AccountRotationService {
  /** 连续失败多少次后屏蔽账号 */
  private readonly failureThreshold: number;
  /** 屏蔽时长（ms） */
  private readonly blockDurationMs: number;

  /** 平台 -> 最后使用的账号 ID */
  private lastAccountIdMap = new Map<string, string>();
  /** 平台:账号ID -> 失败记录 */
  private failureRecords = new Map<string, AccountFailureRecord>();

  constructor(private readonly profileConfig: ProfileConfigService) {
    const threshold = Number(process.env.SCRAPING_ACCOUNT_FAILURE_THRESHOLD || 3);
    this.failureThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 3;
    const blockDuration = Number(process.env.SCRAPING_ACCOUNT_BLOCK_DURATION_MS || 5 * 60 * 1000);
    this.blockDurationMs = Number.isFinite(blockDuration) && blockDuration > 0 ? blockDuration : 5 * 60 * 1000;
  }

  /**
   * 为指定平台选择下一个账号。
   * @param platform '抖音'/'小红书' 或 'douyin'/'xiaohongshu'
   * @param options.prefer 优先账号；若存在且可用则直接返回
   * @param options.exclude 需排除的账号 ID 列表（已经尝试过的）
   */
  nextAccount(
    platform: string,
    options: { prefer?: string; exclude?: string[] } = {},
  ): ScrapingAccount | null {
    const code = this.profileConfig.normalizePlatform(platform);
    const displayPlatform = this.profileConfig.displayPlatform(platform);
    const candidates = this.profileConfig.getCandidates(displayPlatform);

    if (candidates.length === 0) return null;

    // 显式指定账号
    if (options.prefer) {
      const preferred = candidates.find((a) => a.id === options.prefer && !this.isBlocked(a));
      if (preferred) return this.remember(code, preferred);
    }

    // 排除已失败/不可用账号
    const available = candidates.filter((a) => !this.isBlocked(a) && !(options.exclude || []).includes(a.id));
    if (available.length === 0) {
      // 全部屏蔽时，尝试放宽：选择屏蔽时间最久的账号赌一把
      const sorted = candidates
        .map((a) => ({ account: a, record: this.getRecord(a) }))
        .sort((a, b) => a.record.lastFailureAt - b.record.lastFailureAt);
      if (sorted.length > 0) {
        return this.remember(code, sorted[0].account);
      }
      return null;
    }

    // Round-Robin
    const lastId = this.lastAccountIdMap.get(code);
    const startIndex = lastId ? available.findIndex((a) => a.id === lastId) : -1;
    const nextIndex = startIndex >= 0 ? (startIndex + 1) % available.length : 0;
    return this.remember(code, available[nextIndex]);
  }

  /**
   * 记录某账号一次失败。
   */
  recordFailure(platform: string, accountId: string): void {
    const display = this.profileConfig.displayPlatform(platform);
    const key = this.key(display, accountId);
    const existing = this.failureRecords.get(key);
    const now = Date.now();
    this.failureRecords.set(key, {
      consecutiveFailures: (existing?.consecutiveFailures || 0) + 1,
      lastFailureAt: now,
    });
  }

  /**
   * 记录某账号一次成功（清零连续失败）。
   */
  recordSuccess(platform: string, accountId: string): void {
    const display = this.profileConfig.displayPlatform(platform);
    const key = this.key(display, accountId);
    this.failureRecords.delete(key);
  }

  /**
   * 获取轮询状态（调试用）。
   */
  getStatus(platform?: string): RotationStatus | RotationStatus[] {
    if (platform) {
      const displayPlatform = this.profileConfig.displayPlatform(platform);
      const candidates = this.profileConfig.getCandidates(displayPlatform);
      return this.buildStatus(displayPlatform, candidates);
    }
    return (['抖音', '小红书'] as const).map((p) => {
      const candidates = this.profileConfig.getCandidates(p);
      return this.buildStatus(p, candidates);
    });
  }

  /**
   * 判断错误是否应该触发账号切换。
   */
  isAccountSwitchableError(err: any): boolean {
    const msg = String(err?.message || err);
    if (/登录页|登录后|未登录|login_required/.test(msg)) return true;
    if (/操作频繁|账号异常|环境异常|请稍后重试|滑动验证|验证码|风控|验证失败/.test(msg)) return true;
    if (/账号已被封禁|账号已注销|该用户已被封禁/.test(msg)) return true;
    if (/ECONNRESET|ETIMEDOUT|ERR_NETWORK_CHANGED|net::ERR_|Navigation timeout|TimeoutError/.test(msg)) return true;
    return false;
  }

  private remember(code: string, account: ScrapingAccount): ScrapingAccount {
    this.lastAccountIdMap.set(code, account.id);
    return account;
  }

  private isBlocked(account: ScrapingAccount): boolean {
    const record = this.getRecord(account);
    if (record.consecutiveFailures < this.failureThreshold) return false;
    return Date.now() - record.lastFailureAt < this.blockDurationMs;
  }

  private getRecord(account: ScrapingAccount): AccountFailureRecord {
    const key = this.key(this.profileConfig.displayPlatform(account.platform), account.id);
    return this.failureRecords.get(key) || { consecutiveFailures: 0, lastFailureAt: 0 };
  }

  private buildStatus(platform: string, candidates: ScrapingAccount[]): RotationStatus {
    return {
      platform,
      lastAccountId: this.lastAccountIdMap.get(this.profileConfig.normalizePlatform(platform)) || null,
      candidates: candidates.map((a) => a.id),
      failureCounts: candidates.reduce((acc, a) => {
        const record = this.getRecord(a);
        acc[a.id] = {
          consecutiveFailures: record.consecutiveFailures,
          lastFailureAt: record.lastFailureAt || null,
          blocked: this.isBlocked(a),
        };
        return acc;
      }, {} as Record<string, { consecutiveFailures: number; lastFailureAt: number | null; blocked: boolean }>),
    };
  }

  private key(platform: string, accountId: string): string {
    return `${platform}:${accountId}`;
  }
}
