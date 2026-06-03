import { Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Request, Response } from 'express';
import { todayString } from '../../shared/utils/date-utils';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Repository } from 'typeorm';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
   * 运营个人看板，主管查看员工看板也复用这一套统计口径。
   * 从 session userId 解析出 employeeId。
   */
  @Get('personal')
  async getPersonal(
    @Req() req: Request,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ message: '未登录' });
    }
    const employeeId = await this.resolveEmployeeId(userId);
    if (!employeeId) {
      return res.status(400).json({ message: '用户未关联员工' });
    }
    const data = await this.dashboardService.getPersonalDashboard(employeeId, { from, to });
    return res.json(data);
  }

  /**
   * 主管查看指定员工的个人看板。
   * 仅主管可访问。
   */
  @Get('supervisor/employee/:id')
  async getSupervisorEmployee(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const role = getSessionRole(req);
    if (!['admin', 'owner', 'supervisor'].includes(role)) {
      return res.status(403).json({ message: 'forbidden' });
    }
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

  /**
   * 从 userId 解析出 employeeId。
   */
  private async resolveEmployeeId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.employeeId || null;
  }
}
