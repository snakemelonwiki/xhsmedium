import { Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Request, Response } from 'express';
import { todayString } from '../../shared/utils/date-utils';
import { getSessionUserId } from '../../common/session.utils';

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

  /**
   * 运营个人看板，主管员工看板也复用这一套统计口径。
   */
  @Get('personal')
  async getPersonal(
    @Req() req: Request,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const employeeId = getSessionUserId(req) || '';
    const data = await this.dashboardService.getPersonalDashboard(employeeId, { from, to });
    return res.json(data);
  }

  /**
   * 主管查看指定员工的个人看板。
   */
  @Get('supervisor/employee/:id')
  async getSupervisorEmployee(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.dashboardService.getPersonalDashboard(id, { from, to });
    return res.json(data);
  }

  /**
   * 主管总览，按周期返回作品、客资、互动、账号和风险摘要。
   */
  @Get('supervisor/overview')
  async getSupervisorOverview(@Res() res: Response, @Query('period') period?: string) {
    const data = await this.dashboardService.getSupervisorOverview(period || 'today');
    return res.json(data);
  }

  /**
   * 主管基础分析看板，保留平台趋势、作品结构和客资趋势三类指标。
   */
  @Get('supervisor/analysis')
  async getSupervisorAnalysis(
    @Res() res: Response,
    @Query('platform') platform?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const data = await this.dashboardService.getSupervisorAnalysis({ platform, employeeId });
    return res.json(data);
  }

  @Post('refresh-entered-data')
  async refreshEnteredData(@Res() res: Response) {
    const result = await this.dashboardService.refreshEnteredData();
    return res.json(result);
  }
}
