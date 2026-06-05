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
   * v1.3 OP-1/OP-2/OP-3/OP-16 个人看板 5 张概览卡 + 名次。
   *
   * Query:
   *   - metrics   totalLeads / totalTraffic / efficiency / leadEfficiency（默认 totalTraffic）
   *   - platform  xiaohongshu / douyin / all（默认 all）
   *   - period    today / week / month / all（默认 month）
   *   - from/to   自定义区间（与 period 互斥，传入时优先）
   *
   * 运营端：employeeId 来自当前登录用户。
   * 主管端：访问 /supervisor/employee/:id/overview 复用同一服务。
   */
  @Get('personal/overview')
  async getPersonalOverview(
    @Req() req: Request,
    @Res() res: Response,
    @Query('metrics') metrics?: string,
    @Query('platform') platform?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const employeeId = await this.resolveSessionEmployeeId(req);
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getPersonalOverview(employeeId, { metrics, platform, period, from, to });
    return res.json(data);
  }

  @Get('supervisor/employee/:id/overview')
  async getSupervisorEmployeeOverview(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('metrics') metrics?: string,
    @Query('platform') platform?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: '未登录' });
    const data = await this.dashboardService.getPersonalOverview(id, { metrics, platform, period, from, to });
    return res.json(data);
  }

  /**
   * v1.3 OP-17 三大效率榜（OP-24 legacy 样式重设计）。
   *   - traffic         流量榜：账号聚合 likes+comments+favorites 之和
   *   - efficiency      获客效率榜：客资数 / 作品数
   *   - leadEfficiency  获客贴效率榜：客资数 / 获客贴数
   */
  @Get('personal/rankings')
  async getPersonalRankings(
    @Req() req: Request,
    @Res() res: Response,
    @Query('platform') platform?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
  ) {
    const employeeId = await this.resolveSessionEmployeeId(req);
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getPersonalRankings(employeeId, { platform, period, from, to, sort });
    return res.json(data);
  }

  @Get('supervisor/employee/:id/rankings')
  async getSupervisorEmployeeRankings(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('platform') platform?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: '未登录' });
    const data = await this.dashboardService.getPersonalRankings(id, { platform, period, from, to, sort });
    return res.json(data);
  }

  /**
   * v1.3 OP-4 运营总览今日数据：今日作品 / 今日客资 / 今日流量，去除今日成交。
   * 流量口径：likes + comments + favorites。
   */
  @Get('personal/today')
  async getPersonalToday(
    @Req() req: Request,
    @Res() res: Response,
    @Query('platform') platform?: string,
    @Query('date') date?: string,
  ) {
    const employeeId = await this.resolveSessionEmployeeId(req);
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getPersonalToday(employeeId, { platform, date });
    return res.json(data);
  }

  @Get('supervisor/employee/:id/today')
  async getSupervisorEmployeeToday(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('platform') platform?: string,
    @Query('date') date?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: '未登录' });
    const data = await this.dashboardService.getPersonalToday(id, { platform, date });
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
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: '未登录' });
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

  /**
   * v1.3 OP-18: 个人看板双平台分布（作品 / 流量 / 获客占比饼图）
   * - platform: 缺省=全部（返回两个平台）；传 xiaohongshu / douyin / 小红书 / 抖音 仅返回该平台
   */
  @Get('personal/platform-distribution')
  async getPersonalPlatformDistribution(
    @Req() req: Request,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
    @Query('employeeId') employeeIdFromQuery?: string,
  ) {
    let employeeId: string | null = null;
    if (employeeIdFromQuery) {
      const role = getSessionRole(req);
      if (!['admin', 'supervisor', 'owner'].includes(role)) {
        return res.status(403).json({ message: '无权查看其他员工数据' });
      }
      employeeId = employeeIdFromQuery;
    } else {
      employeeId = await this.resolveSessionEmployeeId(req);
    }
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getPlatformDistribution(employeeId, { from, to, platform });
    return res.json(data);
  }

  /**
   * v1.3 OP-19: 个人看板双平台作品量（每日/每周/每月）
   * - period: day | week | month（默认 day）
   * - 返回 { period, from, to, points: [{date, xiaohongshuCount, douyinCount, xiaohongshuTraffic, douyinTraffic, xiaohongshuLeads, douyinLeads}] }
   */
  @Get('personal/platform-trend')
  async getPersonalPlatformTrend(
    @Req() req: Request,
    @Res() res: Response,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeIdFromQuery?: string,
  ) {
    let employeeId: string | null = null;
    if (employeeIdFromQuery) {
      const role = getSessionRole(req);
      if (!['admin', 'supervisor', 'owner'].includes(role)) {
        return res.status(403).json({ message: '无权查看其他员工数据' });
      }
      employeeId = employeeIdFromQuery;
    } else {
      employeeId = await this.resolveSessionEmployeeId(req);
    }
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getPlatformTrend(employeeId, { period, from, to });
    return res.json(data);
  }

  /**
   * v1.3 OP-23: 账号时间序列（按日聚合），用于账号分析子菜单日历视图
   * - days: 30 默认（最大 90）；与 from/to 互斥
   * - 返回 { account, from, to, days: [{date, postCount, leadCount, traffic, posts}], summary }
   */
  @Get('personal/account/:accountId/timeseries')
  async getPersonalAccountTimeseries(
    @Param('accountId') accountId: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!accountId) return res.status(400).json({ message: 'accountId 必填' });
    const data = await this.dashboardService.getAccountTimeSeries(accountId, {
      days: days ? Number(days) : undefined,
      from,
      to,
    });
    return res.json(data);
  }

  /**
   * v1.3 OP-23 扩展：当前员工名下「全部账号」聚合时间序列。
   * - 默认视图，不需选账号
   * - days: 30 默认（最大 90）；与 from/to 互斥
   * - platform: 可选平台过滤
   * - 返回结构与单账号接口兼容，前端共用日历组件
   */
  @Get('personal/accounts/timeseries')
  async getPersonalAllAccountsTimeseries(
    @Req() req: Request,
    @Res() res: Response,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
    @Query('sort') sort?: string,
    @Query('employeeId') employeeIdFromQuery?: string,
  ) {
    let employeeId: string | null = null;
    if (employeeIdFromQuery) {
      const role = getSessionRole(req);
      if (!['admin', 'supervisor', 'owner'].includes(role)) {
        return res.status(403).json({ message: '无权查看其他员工数据' });
      }
      employeeId = employeeIdFromQuery;
    } else {
      employeeId = await this.resolveSessionEmployeeId(req);
    }
    if (!employeeId) return res.status(401).json({ message: '未登录或未关联员工' });
    const data = await this.dashboardService.getAllAccountsTimeSeries(employeeId, {
      days: days ? Number(days) : undefined,
      from,
      to,
      platform: platform || undefined,
      sort,
    });
    return res.json(data);
  }

  @Post('refresh-entered-data')
  async refreshEnteredData(@Res() res: Response) {
    const result = await this.dashboardService.refreshEnteredData();
    return res.json(result);
  }

  /**
   * 手动失效 dashboard 模块的全部缓存。
   * 适用场景：直接通过 SQL 写入主表（绕过 NestJS service）后，需要让看板/账号分析/排行榜立刻看到新数据。
   * 权限：admin / owner / supervisor。
   */
  @Post('invalidate-cache')
  async invalidateCache(@Req() req: Request, @Res() res: Response) {
    const role = String(getSessionRole(req) || '').toLowerCase();
    if (!['admin', 'owner', 'supervisor'].includes(role)) {
      return res.status(403).json({ ok: false, message: '仅管理员/主管/超管可操作' });
    }
    this.dashboardService.invalidateAll();
    return res.json({ ok: true, message: 'dashboard 缓存已清空' });
  }

  /**
   * 从 session userId 解析出 employeeId。
   */
  private async resolveEmployeeId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return user?.employeeId || null;
  }

  /** 从 session 解析当前登录用户对应的 employeeId；返回 null 时调用方应返回 401 */
  private async resolveSessionEmployeeId(req: Request): Promise<string | null> {
    const userId = getSessionUserId(req);
    if (!userId) return null;
    return this.resolveEmployeeId(userId);
  }

  /** 主管/超管/owner 角色判断：用于个人看板系列端点的访问控制。
   *  兼容旧角色别名：staff / operation 与 admin/supervisor 视为同义（运营员工可在主管端查看个人看板）。
   *  Owner 通过 3001 端口登录、admin/supervisor 通过 3000 或 3003 登录。 */
  private isSupervisorRole(req: Request): boolean {
    const role = getSessionRole(req);
    return ['admin', 'owner', 'supervisor', 'staff', 'operation'].includes(role);
  }
}
