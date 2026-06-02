import { DashboardController } from './dashboard.controller';

describe('DashboardController A端看板契约', () => {
  const response = () => ({
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('返回运营个人看板数据', async () => {
    const service = {
      getPersonalDashboard: jest.fn().mockResolvedValue({ overview: { postCount: 3 } }),
    } as any;
    const controller = new DashboardController(service);
    const res = response();

    await controller.getPersonal({ session: { userId: 'emp-1' } } as any, res, undefined, undefined);

    expect(service.getPersonalDashboard).toHaveBeenCalledWith('emp-1', expect.objectContaining({}));
    expect(res.json).toHaveBeenCalledWith({ overview: { postCount: 3 } });
  });

  it('主管查看指定员工个人看板复用同一统计口径', async () => {
    const service = {
      getPersonalDashboard: jest.fn().mockResolvedValue({ overview: { postCount: 5 } }),
    } as any;
    const controller = new DashboardController(service);
    const res = response();

    await controller.getSupervisorEmployee('emp-2', res, '2026-06-01', '2026-06-30');

    expect(service.getPersonalDashboard).toHaveBeenCalledWith('emp-2', { from: '2026-06-01', to: '2026-06-30' });
    expect(res.json).toHaveBeenCalledWith({ overview: { postCount: 5 } });
  });

  it('返回主管总览和分析看板', async () => {
    const service = {
      getSupervisorOverview: jest.fn().mockResolvedValue({ postCount: 10 }),
      getSupervisorAnalysis: jest.fn().mockResolvedValue({ platformTrend: [] }),
    } as any;
    const controller = new DashboardController(service);
    const overviewRes = response();
    const analysisRes = response();

    await controller.getSupervisorOverview(overviewRes, 'month');
    await controller.getSupervisorAnalysis(analysisRes, '小红书', 'emp-1');

    expect(service.getSupervisorOverview).toHaveBeenCalledWith('month');
    expect(service.getSupervisorAnalysis).toHaveBeenCalledWith({ platform: '小红书', employeeId: 'emp-1' });
    expect(overviewRes.json).toHaveBeenCalledWith({ postCount: 10 });
    expect(analysisRes.json).toHaveBeenCalledWith({ platformTrend: [] });
  });
});
