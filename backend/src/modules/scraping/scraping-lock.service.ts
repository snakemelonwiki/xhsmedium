import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * 全局抓取锁（单进程内存级）
 *
 * 规则：
 *   - 单进程同时只允许 1 个抓取任务在跑（互斥）
 *   - 上一个任务结束到下一个开始至少间隔 8s（防止抖音/小红书风控）
 *   - 等待中的任务上限 20 个，队列满立刻抛 ServiceUnavailableException → 429
 *
 * 用途：被 ParserService.parse() 包裹，所有抓取路径自动获得串行化保护。
 *
 * 注意：本服务不写库，只做调度；告警的「连续失败」「累计失败」由 ScrapingAlertService 维护。
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
  /** 最小间隔（ms） */
  private readonly minGapMs = 8000;
  /** 队列上限 */
  private readonly maxQueue = 20;

  /**
   * 把 fn 包进锁内执行。队列满 → 立即抛 ServiceUnavailableException。
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queued >= this.maxQueue) {
      throw new ServiceUnavailableException({
        ok: false,
        code: 'SCRAPING_QUEUE_FULL',
        message: `抓取队列已满（${this.queued}/${this.maxQueue}），请稍后再试`,
        retryAfterMs: this.minGapMs,
      });
    }
    this.queued++;

    try {
      // 等待互斥锁
      while (this.running > 0) {
        await sleep(50);
      }

      // 互斥拿到后，等最小间隔
      const now = Date.now();
      const wait = this.lastFinishedAt + this.minGapMs - now;
      if (wait > 0) {
        this.logger.debug?.(`[scraping-lock] 距上次结束 ${wait}ms，等待间隔`);
        await sleep(wait);
      }

      this.running++;
      try {
        return await fn();
      } finally {
        this.running--;
        this.lastFinishedAt = Date.now();
      }
    } finally {
      this.queued--;
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
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
