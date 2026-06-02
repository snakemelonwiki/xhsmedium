import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { Request, Response } from 'express';
import { todayString, yesterdayString } from '../../shared/utils/date-utils';
import { getSessionUserId } from '../../common/session.utils';

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
  ) {
    const session = (req as any).session;
    const targetDate = date || todayString();
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.rankingsService.getRankingsPaged(
        type || 'posts',
        targetDate,
        Number(limit) || 20,
        Number(offset) || 0,
        { platform, period },
      );
      return res.json(result);
    }
    const rows = await this.rankingsService.getRankings(type || 'posts', targetDate, { platform, period });
    return res.json(rows);
  }

  /**
   * A端运营排行榜契约别名，统一承载作品数、客资数、流量和学习榜入口。
   */
  @Get('operations')
  async getOperationRankings(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('platform') platform?: string,
  ) {
    const result = await this.rankingsService.getRankingsPaged(
      type || 'posts',
      todayString(),
      Number(limit) || 20,
      Number(offset) || 0,
      { platform, period },
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
