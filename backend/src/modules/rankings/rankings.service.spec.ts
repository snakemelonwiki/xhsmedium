import { RankingsService } from './rankings.service';

jest.mock('../posts/posts.service', () => ({
  PostsService: jest.fn(),
}));

describe('RankingsService', () => {
  it('returns merged metrics when sorting operation rankings by leads', async () => {
    const dashboardService = {
      rankingRows: jest.fn().mockResolvedValue([
        { employeeId: 'emp-a', name: '员工A', accountCount: 2, todayDeals: 1 },
        { employeeId: 'emp-b', name: '员工B', accountCount: 1, todayDeals: 0 },
      ]),
    };
    const postsService = {
      findAll: jest.fn().mockResolvedValue([
        { employeeId: 'emp-a', platform: '小红书' },
        { employeeId: 'emp-a', platform: '抖音' },
        { employeeId: 'emp-b', platform: '小红书' },
      ]),
    };
    const leadsService = {
      findAll: jest.fn().mockResolvedValue([
        { employeeId: 'emp-b', contactInfo: '13800000000', status: 'new' },
        { employeeId: 'emp-b', contactInfo: '13900000000', status: 'new' },
        { employeeId: 'emp-a', contactInfo: '13700000000', status: 'new' },
      ]),
    };

    const service = new RankingsService(
      dashboardService as any,
      postsService as any,
      leadsService as any,
      { query: jest.fn() } as any,
    );

    const rows = await service.getRankings('leads', '2026-06-06', { period: '7d' });

    expect(rows).toEqual([
      expect.objectContaining({
        employeeId: 'emp-b',
        leadCount: 2,
        postCount: 1,
        xhsPostCount: 1,
        douyinPostCount: 0,
        accountCount: 1,
        todayDeals: 0,
      }),
      expect.objectContaining({
        employeeId: 'emp-a',
        leadCount: 1,
        postCount: 2,
        xhsPostCount: 1,
        douyinPostCount: 1,
        accountCount: 2,
        todayDeals: 1,
      }),
    ]);
  });
});
