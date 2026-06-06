import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { Request, Response } from 'express';
import { todayString } from '../../shared/utils/date-utils';
import { getSessionUserId } from '../../common/session.utils';

/** 支持的榜单类型 */
const RANKING_TYPES = ['posts', 'leads', 'traffic', 'study'];

/** 支持的榜单周期。
 *  v1.3 / OP-7：补齐 90d / 1y / 3y，覆盖 QuickRangePicker RANGE_PRESETS_FULL
 *  全部 12 个预设。如有未列出的预设（用户手动选了 RangePicker 任意区间），
 *  请同时传 from / to，由 service 端走 options.range 优先级。
 */
const RANKING_PERIODS = ['today', 'week', 'month', 'total', '7d', '14d', '30d', '90d', '1y', '3y'];

/** ISO 日期串（YYYY-MM-DD）宽松校验。用于 from/to 透传时的兜底。 */
function isValidDate(s: any): s is string {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s);
  return !isNaN(t.getTime());
}

@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  async getRankings(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('platform') platform?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const targetDate = date || todayString();
    const normalizedType = RANKING_TYPES.includes(type || '') ? type : 'posts';
    const normalizedPeriod = RANKING_PERIODS.includes(period || '') ? period : 'today';
    const range = isValidDate(from) || isValidDate(to) ? { from, to } : undefined;
    const options = { platform, period: normalizedPeriod, range };
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.rankingsService.getRankingsPaged(
        normalizedType,
        targetDate,
        Number(limit) || 20,
        Number(offset) || 0,
        options,
      );
      return res.json(result);
    }
    const rows = await this.rankingsService.getRankings(normalizedType, targetDate, options);
    return res.json(rows);
  }

  /**
   * A端运营排行榜契约别名，统一承载作品数、客资数、流量和学习榜入口。
   * 支持的 type: posts / leads / traffic / study
   * 支持的 period: today / week / month / total / 7d / 14d / 30d / 90d / 1y / 3y
   * 支持 from / to 透传：与 period 互斥，from/to 优先。
   */
  @Get('operations')
  async getOperationRankings(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('platform') platform?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const normalizedType = RANKING_TYPES.includes(type || '') ? type : 'posts';
    const normalizedPeriod = RANKING_PERIODS.includes(period || '') ? period : 'today';
    const range = isValidDate(from) || isValidDate(to) ? { from, to } : undefined;
    const result = await this.rankingsService.getRankingsPaged(
      normalizedType,
      todayString(),
      Number(limit) || 20,
      Number(offset) || 0,
      { platform, period: normalizedPeriod, range },
    );
    return res.json(result);
  }

  /**
   * 学习榜：返回最近 N 天发布且有获客的 Top10 作品，附带 isFavorited。
   * 当前登录用户的 userId 来自全局 SessionMiddleware；未登录时 isFavorited 全部为 false。
   */
  @Get('learning-posts')
  async getLearningPosts(@Query('days') days: string | undefined, @Req() req: Request, @Res() res: Response) {
    const userId: string = getSessionUserId(req);
    const parsed = Number(days);
    const safeDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
    const rows = await this.rankingsService.getLearningPosts(safeDays, userId);
    return res.json(rows);
  }
}
