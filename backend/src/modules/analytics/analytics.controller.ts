import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CacheService } from '../../shared/cache.service';

/**
 * 统计看板控制器（P2-B 性能底座）
 * - GET /api/analytics/snapshots?days=N 默认 7，最大 90
 * - 30s 进程内缓存：key = analytics:snapshots:<userId>:<period>:<days>
 *   period 默认 'all'（看板场景无分时聚合），可由后续业务传 'today'/'week'/'month'
 * - 写主表（导入/补单/成交）不影响缓存：30s 内用户会读到旧值，期内看板场景可接受
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly cache: CacheService,
  ) {}

  @Get('snapshots')
  async getSnapshots(
    @Query('days') days: string | undefined,
    @Query('period') period: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = String(req?.user?.id || req?.user?.userId || 'anonymous');
    const safePeriod = String(period || 'all').trim() || 'all';
    const key = `analytics:snapshots:${userId}:${safePeriod}:${days || '7'}`;

    res.setHeader('Cache-Control', 'max-age=30');

    const cached = this.cache.get<any>(key);
    if (cached !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }
    const fresh = await this.analytics.getSnapshots(Number(days) || 7);
    this.cache.set(key, fresh, 30_000);
    res.setHeader('X-Cache', 'MISS');
    return res.json(fresh);
  }
}
