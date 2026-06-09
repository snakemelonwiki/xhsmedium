import { DashboardController } from './dashboard.controller';
import { User } from '../../entities/user.entity';
import { Repository } from 'typeorm';

describe('DashboardController A端看板契约', () => {
  const response = () => ({
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  }) as any;

  it('返回运营个人看板数据', async () => {
    const service = {
      getPersonalDashboard: jest.fn().mockResolvedValue({ overview: { postCount: 3 } }),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonal(req, res, undefined, undefined);

    expect(service.getPersonalDashboard).toHaveBeenCalledWith('emp-1', expect.objectContaining({}));
    expect(res.json).toHaveBeenCalledWith({ overview: { postCount: 3 } });
  });

  it('主管查看指定员工个人看板复用同一统计口径', async () => {
    const service = {
      getPersonalDashboard: jest.fn().mockResolvedValue({ overview: { postCount: 5 } }),
    } as any;
    const userRepo = {} as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'admin-1', role: 'admin' } } as any;

    await controller.getSupervisorEmployee('emp-2', req, res, '2026-06-01', '2026-06-30');

    expect(service.getPersonalDashboard).toHaveBeenCalledWith('emp-2', { from: '2026-06-01', to: '2026-06-30' });
    expect(res.json).toHaveBeenCalledWith({ overview: { postCount: 5 } });
  });

  it('返回主管总览和分析看板', async () => {
    const service = {
      getSupervisorOverview: jest.fn().mockResolvedValue({ postCount: 10 }),
      getSupervisorAnalysis: jest.fn().mockResolvedValue({ platformTrend: [] }),
    } as any;
    const userRepo = {} as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const overviewRes = response();
    const analysisRes = response();

    await controller.getSupervisorOverview(overviewRes, 'month');
    await controller.getSupervisorAnalysis(analysisRes, '小红书', 'emp-1', 'acc-1', '2026-06-01', '2026-06-30');

    expect(service.getSupervisorOverview).toHaveBeenCalledWith('month');
    expect(service.getSupervisorAnalysis).toHaveBeenCalledWith({
      platform: '小红书',
      employeeId: 'emp-1',
      accountId: 'acc-1',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(overviewRes.json).toHaveBeenCalledWith({ postCount: 10 });
    expect(analysisRes.json).toHaveBeenCalledWith({ platformTrend: [] });
  });

  it('v1.3 个人看板 5 张概览卡 + 名次：运营端从 session 解析 employeeId', async () => {
    const service = {
      getPersonalOverview: jest.fn().mockResolvedValue({ overview: { totalTraffic: 100 }, ranking: { rank: 3, total: 8 } }),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalOverview(req, res, 'totalTraffic', 'xiaohongshu', 'month');

    expect(service.getPersonalOverview).toHaveBeenCalledWith('emp-1', {
      metrics: 'totalTraffic',
      platform: 'xiaohongshu',
      period: 'month',
      from: undefined,
      to: undefined,
    });
    expect(res.json).toHaveBeenCalledWith({ overview: { totalTraffic: 100 }, ranking: { rank: 3, total: 8 } });
  });

  it('v1.3 主管端查看指定员工概览：仅 admin/owner/supervisor/staff/operation 可访问', async () => {
    const service = {
      getPersonalOverview: jest.fn().mockResolvedValue({ overview: { totalTraffic: 50 } }),
    } as any;
    const userRepo = {} as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    // 销售/教务角色仍应被拒绝
    const salesRes = response();
    const salesReq = { session: { userId: 'sales-1', role: 'sales' } } as any;
    await controller.getSupervisorEmployeeOverview('emp-2', salesReq, salesRes, 'totalLeads', 'all', 'month');
    expect(salesRes.status).toHaveBeenCalledWith(403);

    // admin 角色允许
    const adminRes = response();
    const adminReq = { session: { userId: 'admin-1', role: 'admin' } } as any;
    await controller.getSupervisorEmployeeOverview('emp-2', adminReq, adminRes, 'totalLeads', 'all', 'month');
    expect(service.getPersonalOverview).toHaveBeenCalledWith('emp-2', {
      metrics: 'totalLeads',
      platform: 'all',
      period: 'month',
      from: undefined,
      to: undefined,
    });
  });

  it('v1.3 三大效率榜端点返回 traffic / efficiency / leadEfficiency 三组账号榜', async () => {
    const service = {
      getPersonalRankings: jest.fn().mockResolvedValue({ accounts: { traffic: [], efficiency: [], leadEfficiency: [] } }),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalRankings(req, res, 'douyin', 'week');

    expect(service.getPersonalRankings).toHaveBeenCalledWith('emp-1', { platform: 'douyin', period: 'week', from: undefined, to: undefined });
    expect(res.json).toHaveBeenCalledWith({ accounts: { traffic: [], efficiency: [], leadEfficiency: [] } });
  });

  it('v1.3 运营总览今日数据：返回 todayPostCount / todayLeadCount / todayTraffic，不返回 todayDeals', async () => {
    const service = {
      getPersonalToday: jest.fn().mockResolvedValue({ todayPostCount: 4, todayLeadCount: 7, todayTraffic: 320 }),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalToday(req, res, 'all', '2026-06-04');

    expect(service.getPersonalToday).toHaveBeenCalledWith('emp-1', { platform: 'all', date: '2026-06-04' });
    expect(res.json).toHaveBeenCalledWith({ todayPostCount: 4, todayLeadCount: 7, todayTraffic: 320 });
  });

  // v1.3 OP-18 双平台分布
  it('v1.3 OP-18 个人看板双平台分布：从 session 解析 employeeId 并透传 from/to/platform', async () => {
    const service = {
      getPlatformDistribution: jest.fn().mockResolvedValue([
        { platform: '小红书', postCount: 5, leadCount: 3, traffic: 120 },
        { platform: '抖音', postCount: 2, leadCount: 1, traffic: 60 },
      ]),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalPlatformDistribution(req, res, '2026-06-01', '2026-06-30', 'all');

    expect(service.getPlatformDistribution).toHaveBeenCalledWith('emp-1', {
      from: '2026-06-01',
      to: '2026-06-30',
      platform: 'all',
    });
    expect(res.json).toHaveBeenCalledWith([
      { platform: '小红书', postCount: 5, leadCount: 3, traffic: 120 },
      { platform: '抖音', postCount: 2, leadCount: 1, traffic: 60 },
    ]);
  });

  // v1.3 OP-19 双平台作品量
  it('v1.3 OP-19 个人看板双平台作品量：period=week 返回 time-bucketed 数组', async () => {
    const service = {
      getPlatformTrend: jest.fn().mockResolvedValue({
        period: 'week',
        from: '2026-06-01',
        to: '2026-06-30',
        points: [
          { date: '2026-W22', xiaohongshuCount: 4, douyinCount: 1, xiaohongshuTraffic: 80, douyinTraffic: 20, xiaohongshuLeads: 2, douyinLeads: 0 },
        ],
      }),
    } as any;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', employeeId: 'emp-1' }),
    } as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalPlatformTrend(req, res, 'week', '2026-06-01', '2026-06-30');

    expect(service.getPlatformTrend).toHaveBeenCalledWith('emp-1', {
      period: 'week',
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ period: 'week', points: expect.any(Array) }));
  });

  // v1.3 OP-23 账号时间序列
  it('v1.3 OP-23 账号时间序列：days=30 默认，accountId 必填', async () => {
    const service = {
      getAccountTimeSeries: jest.fn().mockResolvedValue({
        account: { id: 'acc-1', accountName: '测试账号', platform: '小红书', postingPlan: '日更' },
        from: '2026-05-06',
        to: '2026-06-04',
        days: [{ date: '2026-06-04', postCount: 1, leadCount: 2, traffic: 30, posts: [] }],
        summary: { postCount: 1, leadCount: 2, traffic: 30, highLeadDays: 1, lowLeadDays: 0, noPostDays: 0 },
      }),
    } as any;
    const userRepo = {} as any;
    const controller = new DashboardController(service, userRepo as Repository<User>);
    const res = response();
    const req = { session: { userId: 'user-1' } } as any;

    await controller.getPersonalAccountTimeseries('acc-1', req, res, '30', undefined, undefined);

    expect(service.getAccountTimeSeries).toHaveBeenCalledWith('acc-1', {
      days: 30,
      from: undefined,
      to: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      account: expect.objectContaining({ id: 'acc-1', accountName: '测试账号' }),
      days: expect.any(Array),
      summary: expect.any(Object),
    }));
  });
});

/**
 * 回归：computeAccountTimeSeries 的 SQL 输出 r.date 必须是 'YYYY-MM-DD' 字符串。
 * 如果回退到 `p.published_at`（DATETIME）或 `DATE(l.created_at)`，mysql2 会返回 JS Date 对象，
 * String(date).slice(0,10) 拿到 "Tue Apr 28" 这种星期前缀，导致 daysMap.has(day) 永远 false，
 * 接口全 0。本测试 mock 出字符串日期，验证聚合正确归桶。
 */
describe('DashboardService 账号时间序列日期格式回归', () => {
  it('SQL 输出 r.date 为 YYYY-MM-DD 字符串时能正确归桶', async () => {
    const accountRepo = { findOne: jest.fn().mockResolvedValue({ id: 'acc-1', platform: '小红书' }) } as any;
    const postRepo = {
      query: jest.fn().mockResolvedValue([
        { id: 'p1', date: '2026-05-22', title: 't1', platform: '小红书', post_type: '获客贴', likes: 100, comments: 5, favorites: 10, traffic: 0, lead_count: 2 },
        { id: 'p2', date: '2026-05-22', title: 't2', platform: '小红书', post_type: '话题贴', likes: 50, comments: 2, favorites: 8, traffic: 0, lead_count: 0 },
        { id: 'p3', date: '2026-05-23', title: 't3', platform: '小红书', post_type: '话题贴', likes: 30, comments: 1, favorites: 3, traffic: 0, lead_count: 0 },
      ]),
    } as any;
    const leadRepo = {
      query: jest.fn().mockResolvedValue([
        { date: '2026-05-22', post_id: 'p1', lead_count: 2 },
      ]),
    } as any;
    const cache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() } as any;
    // 反射拿到 private computeAccountTimeSeries
    const { DashboardService } = require('./dashboard.service');
    const svc = new (DashboardService as any)(postRepo, leadRepo, {}, accountRepo, {}, cache);
    const result = await svc['computeAccountTimeSeries']('acc-1', '2026-05-22', '2026-05-23');
    const byDate = Object.fromEntries(result.days.map((d: any) => [d.date, d]));
    // 关键：5-22 必须有 2 帖 + 2 客资 + 流量 115；如果日期是 Date 对象归桶失败，结果全是 0
    expect(byDate['2026-05-22'].postCount).toBe(2);
    expect(byDate['2026-05-22'].leadCount).toBe(2);
    expect(byDate['2026-05-22'].traffic).toBe(100 + 5 + 10 + 50 + 2 + 8);
    expect(byDate['2026-05-22'].posts).toHaveLength(2);
    expect(byDate['2026-05-23'].postCount).toBe(1);
    expect(byDate['2026-05-23'].posts[0].platform).toBe('小红书');
  });

  it('SQL 输出 r.date 为 JS Date 对象（错误格式）会全部归桶失败，postCount 全 0', async () => {
    // 这个测试锁住"反例"：如果有人把 SQL 改回不带 DATE_FORMAT，会看到全 0 的回归
    const accountRepo = { findOne: jest.fn().mockResolvedValue({ id: 'acc-1' }) } as any;
    const postRepo = {
      query: jest.fn().mockResolvedValue([
        { id: 'p1', date: new Date('2026-05-22T00:00:00Z'), title: 't1', platform: '小红书', post_type: '获客贴', likes: 100, comments: 5, favorites: 10, traffic: 0, lead_count: 2 },
      ]),
    } as any;
    const leadRepo = { query: jest.fn().mockResolvedValue([]) } as any;
    const cache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() } as any;
    const { DashboardService } = require('./dashboard.service');
    const svc = new (DashboardService as any)(postRepo, leadRepo, {}, accountRepo, {}, cache);
    const result = await svc['computeAccountTimeSeries']('acc-1', '2026-05-22', '2026-05-22');
    const day = result.days.find((d: any) => d.date === '2026-05-22');
    // 反例断言：Date 对象情况下 postCount 必然是 0（因为 daysMap.has('Fri May 22') 永远 false）
    expect(day.postCount).toBe(0);
    expect(day.posts).toHaveLength(0);
  });

  it('全部账号时间序列的平台过滤兼容 xiaohongshu/douyin 简写', async () => {
    const accountRepo = {
      query: jest.fn().mockResolvedValue([]),
    } as any;
    const cache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() } as any;
    const { DashboardService } = require('./dashboard.service');
    const svc = new (DashboardService as any)({}, {}, {}, accountRepo, {}, cache);

    await svc.getAllAccountsTimeSeries('emp-1', {
      from: '2026-06-01',
      to: '2026-06-30',
      platform: 'xiaohongshu',
    });

    expect(accountRepo.query).toHaveBeenCalledWith(
      expect.any(String),
      ['2026-06-01', '2026-06-30', '2026-06-01', '2026-06-30', 'emp-1', '小红书'],
    );
  });
});
