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
}
