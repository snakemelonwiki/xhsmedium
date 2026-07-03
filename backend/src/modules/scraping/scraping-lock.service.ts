import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * 全局抓取锁（单进程内存级）
 *
 * 规则：
 *   - 单进程同时只允许 1 个抓取任务在跑（互斥）
 *   - 上一个任务结束到下一个开始至少间隔 minGapMs（防止抖音/小红书风控）
 *   - 队列上限 maxQueue，满时不立即拒绝，而是等待空位（带超时）
 *   - 单任务运行超时：防止 Playwright 卡死导致锁长期不释放
 *   - 死锁检测：等待互斥锁超过 runTimeoutMs×80% 时告警
 *
 * 防死锁机制：
 *   - queueWaitTimeoutMs: 队列等待超时，避免无限排队
 *   - runTimeoutMs: 单任务运行超时，超时后释放锁让后续任务继续
 *   - 连续超时计数：用于告警和排查
 */
@Injectable()
export class ScrapingLockService {
  private readonly logger = new Logger(ScrapingLockService.name);

  /** 当前正在跑的任务数（应 0/1） */
  private running = 0;
  /** 队列里等待的任务数 */
  private queued = 0;
  /** 上一次成功结束的时间（ms epoch） */
  private lastFinishedAt = 0;
  /** 最小间隔（ms）—— 默认 3s（旧值 8s 偏长） */
  private readonly minGapMs = (() => {
    const raw = Number(process.env.SCRAPING_LOCK_MIN_GAP_MS || 3000);
    return Number.isFinite(raw) && raw >= 0 ? raw : 3000;
  })();
  /** 队列上限（至少 1） */
  private readonly maxQueue = Math.max(1, parseFiniteEnv('SCRAPING_LOCK_MAX_QUEUE', 50));
  /** 队列等待超时（ms）—— 默认 60s */
  private readonly queueWaitTimeoutMs = parseFiniteEnv('SCRAPING_LOCK_QUEUE_WAIT_TIMEOUT_MS', 60000);
  /** 单任务运行超时（ms）—— 默认 60s，防止 Playwright 卡死导致锁长期不释放 */
  private readonly runTimeoutMs = parseFiniteEnv('SCRAPING_LOCK_RUN_TIMEOUT_MS', 60000);
  /** 连续超时计数（成功执行后归零） */
  private consecutiveTimeouts = 0;

  /**
   * 把 fn 包进锁内执行。队列满时等待空位（带超时），超时抛 ServiceUnavailableException。
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // 队列满时等待空位（带超时）
    if (this.queued >= this.maxQueue) {
      if (!(await this.waitForQueueSlot()) || this.queued >= this.maxQueue) {
        throw new ServiceUnavailableException({
          ok: false,
          code: 'SCRAPING_QUEUE_FULL',
          message: `抓取队列已满（${this.queued}/${this.maxQueue}），等待超时，请稍后再试`,
          retryAfterMs: this.minGapMs,
        });
      }
    }

    this.queued++;

    try {
      // 等待互斥锁（含死锁检测）
      await this.waitForMutex();

      // 等最小间隔
      const now = Date.now();
      const wait = this.lastFinishedAt + this.minGapMs - now;
      if (wait > 0) {
        this.logger.debug(`[scraping-lock] 距上次结束 ${wait}ms，等待间隔`);
        await sleep(wait);
      }

      this.running++;
      try {
        const result = await this.withRunTimeout(fn());
        this.consecutiveTimeouts = 0;
        return result;
      } finally {
        this.running--;
        this.lastFinishedAt = Date.now();
      }
    } finally {
      this.queued--;
    }
  }

  /**
   * 等待队列出现空位。
   * @returns true 表示成功等到空位，false 表示超时
   */
  private async waitForQueueSlot(): Promise<boolean> {
    const start = Date.now();
    while (this.queued >= this.maxQueue) {
      if (Date.now() - start > this.queueWaitTimeoutMs) {
        this.logger.warn(
          `[scraping-lock] 队列满(${this.queued}/${this.maxQueue})，` +
          `等待空位超时(${this.queueWaitTimeoutMs}ms)`,
        );
        return false;
      }
      await sleep(300);
    }
    return true;
  }

  /**
   * 等待互斥锁释放，含死锁检测。
   * 超过 deadlockWarnThreshold 未拿到锁时记录告警日志，超过 queueWaitTimeoutMs 后超时退出。
   */
  private async waitForMutex(): Promise<void> {
    const start = Date.now();
    let warned = false;
    // 死锁预警阈值：runTimeoutMs 的 80%（避免在任务正常执行期间误报）
    const deadlockWarnThreshold = Math.floor(this.runTimeoutMs * 0.8);
    // 硬超时：使用队列等待超时作为上限（避免无限阻塞）
    const hardTimeout = this.queueWaitTimeoutMs;
    while (this.running > 0) {
      const elapsed = Date.now() - start;
      if (elapsed > deadlockWarnThreshold && !warned) {
        this.logger.warn(
          `[scraping-lock] ⚠️ 等待互斥锁已 ${Math.round(elapsed / 1000)}s（阈值 ${Math.round(deadlockWarnThreshold / 1000)}s），` +
          `running=${this.running}，疑似死锁（任务可能卡死）`,
        );
        warned = true;
      }
      if (elapsed > hardTimeout) {
        this.logger.error(
          `[scraping-lock] 🚨 等待互斥锁超时(${hardTimeout}ms)，` +
          `running=${this.running}，强制释放队列等待`,
        );
        throw new Error(`抓取锁等待超时（${hardTimeout}ms），请检查网络或平台状态`);
      }
      await sleep(300);
    }
  }

  /**
   * 给 fn() 执行加上超时保护。
   * 超时后提前返回错误，fn() 在后台继续但锁已释放。
   */
  private async withRunTimeout<T>(promise: Promise<T>): Promise<T> {
    if (this.runTimeoutMs <= 0) return promise;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        promise.then(
          (result): T => result,
          (error) => { throw error; },
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`TIMEOUT:${this.runTimeoutMs}`));
          }, this.runTimeoutMs);
        }),
      ]);
    } catch (err: any) {
      if (String(err?.message || '').startsWith('TIMEOUT:')) {
        this.consecutiveTimeouts++;
        this.logger.error(
          `[scraping-lock] 🚨 任务运行超时(${this.runTimeoutMs}ms)，` +
          `连续超时 ${this.consecutiveTimeouts} 次，锁已释放让后续任务继续`,
        );
        // 清除 timer（race 败者可能还没触发 clearTimeout）
        if (timer) clearTimeout(timer);
        // 避免后台任务 reject 变成 unhandled rejection
        promise.catch(() => {});
        throw new Error(`抓取任务执行超时（${this.runTimeoutMs}ms），请检查网络或平台状态`);
      }
      throw err;
    }
  }

  /** 当前锁状态（用于 /api/scraping-alerts/lock-status 调试/展示） */
  getStatus() {
    const now = Date.now();
    const nextAvailableInMs = this.running > 0
      ? -1
      : Math.max(0, this.lastFinishedAt + this.minGapMs - now);
    return {
      running: this.running,
      queued: this.queued,
      maxQueue: this.maxQueue,
      minGapMs: this.minGapMs,
      nextAvailableInMs,
      lastFinishedAt: this.lastFinishedAt || null,
      queueWaitTimeoutMs: this.queueWaitTimeoutMs,
      runTimeoutMs: this.runTimeoutMs,
      consecutiveTimeouts: this.consecutiveTimeouts,
    };
  }
}

function parseFiniteEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
