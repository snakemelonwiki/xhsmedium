import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { Request, Response } from 'express';
import { todayString, yesterdayString } from '../../shared/utils/date-utils';

@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  async getRankings(@Query('type') type: string, @Query('date') date: string | undefined, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const targetDate = date || todayString();
    const rows = await this.rankingsService.getRankings(type || 'posts', targetDate);
    return res.json(rows);
  }
}
