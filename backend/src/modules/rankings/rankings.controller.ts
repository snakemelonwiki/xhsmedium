import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { Request, Response } from 'express';
import { todayString, yesterdayString } from '../../shared/utils/date-utils';

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
      );
      return res.json(result);
    }
    const rows = await this.rankingsService.getRankings(type || 'posts', targetDate);
    return res.json(rows);
  }

  /**
   * 学习榜：返回最近 N 天发布且有获客的 Top10 作品，附带 isFavorited。
   * 当前登录用户的 userId 来自全局 SessionMiddleware；未登录时 isFavorited 全部为 false。
   */
  @Get('learning-posts')
  async getLearningPosts(@Query('days') days: string | undefined, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    const parsed = Number(days);
    const safeDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
    const rows = await this.rankingsService.getLearningPosts(safeDays, userId);
    return res.json(rows);
  }
}
