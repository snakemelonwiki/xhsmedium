import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScrapingAlert } from './scraping-alert.entity';
import { makeId } from '../../shared/utils/id-generator';

interface FailureInput {
  platform: string | null;
  source: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  postId?: string | null;
  postUrl?: string | null;
  context?: Record<string, any> | null;
}

const TOTAL_MILESTONES = [10, 30, 50, 100] as const;
const STREAK_THRESHOLD = 3;

/**
 * 抓取告警服务
 *
 * 职责：
 *   1. 维护「按 platform+source」分组的累计失败次数 + 连续失败次数（内存 Map）
 *   2. 失败时检测是否达到触发阈值：
 *        - 连续失败 >= 3  → event_code = streak_3
 *        - 累计失败达到 10/30/50/100 → event_code = total_10/30/50/100
 *      触发时 insert 一行到 scraping_alerts（owner-only 可见）
 *   3. 成功时仅复位「连续失败」（totalFailed 保留做历史统计）
 *
 * 重要：
 *   - 进程重启会让内存计数归零（acceptable — 告警是 best-effort 信号）
 *   - 写库失败不抛，只 warn（避免告警通道影响主抓取链路）
 */
@Injectable()
export class ScrapingAlertService {
  private readonly logger = new Logger(ScrapingAlertService.name);

  /** key: `${platform ?? 'null'}|${source}` → { failStreak, totalFailed, lastTotalEmitted } */
  private readonly counters = new Map<string, CounterState>();

  constructor(
    @InjectRepository(ScrapingAlert)
    private readonly repo: Repository<ScrapingAlert>,
  ) {}

  /**
   * 记录一次抓取失败：更新计数并按需写告警行。
   * 写库失败只 warn，不影响主流程。
   */
  async recordFailure(input: FailureInput): Promise<void> {
    const key = this.keyOf(input.platform, input.source);
    const state = this.getOrCreate(key);
    state.failStreak += 1;
    state.totalFailed += 1;

    const events: Array<{ code: string; level: string }> = [];
    if (state.failStreak === STREAK_THRESHOLD) {
      events.push({ code: 'streak_3', level: 'error' });
    }
    for (const milestone of TOTAL_MILESTONES) {
      if (state.totalFailed === milestone && milestone > state.lastTotalEmitted) {
        state.lastTotalEmitted = milestone;
        events.push({ code: `total_${milestone}`, level: milestone >= 50 ? 'error' : 'warn' });
      }
    }

    if (events.length === 0) return;

    for (const e of events) {
      try {
        await this.repo.save({
          id: makeId(),
          level: e.level,
          platform: input.platform || null,
          source: input.source,
          eventCode: e.code,
          postId: input.postId || null,
          postUrl: input.postUrl || null,
          errorCode: input.errorCode || null,
          errorMessage: input.errorMessage || null,
          failStreak: state.failStreak,
          totalFailed: state.totalFailed,
          context: input.context ? JSON.stringify(input.context) : null,
          resolved: 0,
        } as Partial<ScrapingAlert>);
        this.logger.warn(
          `[scraping-alert] ${e.code} platform=${input.platform || 'null'} ` +
          `source=${input.source} streak=${state.failStreak} total=${state.totalFailed}`,
        );
      } catch (err: any) {
        this.logger.warn(`[scraping-alert] 写库失败: ${err?.message || err}`);
      }
    }
  }

  /**
   * 记录一次抓取成功：仅复位「连续失败」计数。
   * 累计失败保留，方便 owner 看历史趋势。
   */
  recordSuccess(platform: string | null, source: string = 'parser'): void {
    const key = this.keyOf(platform, source);
    const state = this.counters.get(key);
    if (state && state.failStreak > 0) {
      state.failStreak = 0;
    }
  }

  // ---- 查询 / 处理（owner 端） ----

  async list(opts: {
    level?: string;
    resolved?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    const limit = Math.min(Math.max(Number(opts?.limit) || 50, 1), 500);
    const offset = Math.max(Number(opts?.offset) || 0, 0);
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (opts?.level) qb.andWhere('a.level = :level', { level: opts.level });
    if (opts?.resolved !== undefined) qb.andWhere('a.resolved = :resolved', { resolved: opts.resolved });
    qb.take(limit).skip(offset);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async stats(): Promise<{
    total: number;
    unresolved: number;
    byLevel: Array<{ level: string; count: number }>;
    byEvent: Array<{ eventCode: string; count: number }>;
  }> {
    const total = await this.repo.count();
    const unresolved = await this.repo.count({ where: { resolved: 0 } });
    const byLevelRows = await this.repo
      .createQueryBuilder('a')
      .select('a.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.level')
      .getRawMany();
    const byEventRows = await this.repo
      .createQueryBuilder('a')
      .select('a.event_code', 'eventCode')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.event_code')
      .getRawMany();
    return {
      total,
      unresolved,
      byLevel: byLevelRows.map((r) => ({ level: r.level, count: Number(r.count) })),
      byEvent: byEventRows.map((r) => ({ eventCode: r.eventCode, count: Number(r.count) })),
    };
  }

  async resolve(id: string, resolvedBy: string): Promise<ScrapingAlert | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return null;
    row.resolved = 1;
    row.resolvedAt = new Date();
    row.resolvedBy = resolvedBy;
    return this.repo.save(row);
  }

  // ---- 工具 ----

  private keyOf(platform: string | null, source: string): string {
    return `${platform ?? 'null'}|${source}`;
  }

  private getOrCreate(key: string): CounterState {
    let s = this.counters.get(key);
    if (!s) {
      s = { failStreak: 0, totalFailed: 0, lastTotalEmitted: 0 };
      this.counters.set(key, s);
    }
    return s;
  }

  /** 测试 / 调试用：清空内存计数 */
  resetCounters(): void {
    this.counters.clear();
  }
}

interface CounterState {
  failStreak: number;
  totalFailed: number;
  lastTotalEmitted: number;
}
