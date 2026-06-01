import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * 最近 N 天的日聚合，替代旧 daily-snapshots.json。
   * 默认 7 天；前端如需更长区间传 ?days=30。
   */
  @Get('snapshots')
  async getSnapshots(@Query('days') days: string | undefined, @Res() res: Response) {
    const result = await this.analytics.getSnapshots(Number(days) || 7);
    return res.json(result);
  }
}
