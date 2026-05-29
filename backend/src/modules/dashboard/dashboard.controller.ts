import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Request, Response } from 'express';
import { todayString } from '../../shared/utils/date-utils';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Query('date') date: string | undefined, @Res() res: Response) {
    const summary = await this.dashboardService.getSummary(date || todayString());
    return res.json(summary);
  }

  @Get('post-type-distribution')
  async getPostTypeDistribution(@Query('date') date: string | undefined, @Res() res: Response) {
    const distribution = await this.dashboardService.getPostTypeDistribution(date || todayString());
    return res.json(distribution);
  }

  @Post('refresh-entered-data')
  async refreshEnteredData(@Res() res: Response) {
    const result = await this.dashboardService.refreshEnteredData();
    return res.json(result);
  }
}
