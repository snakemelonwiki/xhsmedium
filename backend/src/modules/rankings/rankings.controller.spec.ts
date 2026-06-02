import { RankingsController } from './rankings.controller';

describe('RankingsController A端契约', () => {
  it('operations 路由透传榜单类型、周期和分页', async () => {
    const service = {
      getRankingsPaged: jest.fn().mockResolvedValue({ items: [{ employeeId: 'emp-1' }], total: 1, limit: 20, offset: 0 }),
    } as any;
    const controller = new RankingsController(service);
    const res = { json: jest.fn() } as any;

    await controller.getOperationRankings(res, 'traffic', 'thisMonth', '20', '0', '小红书');

    expect(service.getRankingsPaged).toHaveBeenCalledWith(
      'traffic',
      expect.any(String),
      20,
      0,
      { platform: '小红书', period: 'thisMonth' },
    );
    expect(res.json).toHaveBeenCalledWith({ items: [{ employeeId: 'emp-1' }], total: 1, limit: 20, offset: 0 });
  });
});
