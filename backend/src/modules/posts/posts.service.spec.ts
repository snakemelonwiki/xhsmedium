import { PostsService } from './posts.service';

describe('PostsService learning board thresholds', () => {
  function buildService() {
    const postRepository = {
      query: jest.fn().mockResolvedValue([]),
    };
    const service = new PostsService(
      postRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, postRepository };
  }

  it('filters learning board candidates by the configured lead or traffic threshold', async () => {
    const { service, postRepository } = buildService();

    await service.getLearningBoard({ dimension: 'composite', days: 7, limit: 20 }, { role: 'admin' });

    const learningBoardSql = postRepository.query.mock.calls[0][0] as string;
    const learningBoardParams = postRepository.query.mock.calls[0][1] as unknown[];

    expect(learningBoardSql).toContain('COALESCE(lc.cnt, 0) >= ?');
    expect(learningBoardSql).toContain('(COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.favorites, 0)) >= ?');
    expect(learningBoardParams).toEqual(expect.arrayContaining([10, 10000]));
  });
});

describe('PostsService plaza filters', () => {
  function buildService() {
    const postRepository = {
      query: jest.fn()
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([]),
    };
    const service = new PostsService(
      postRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, postRepository };
  }

  it('作品广场按发布时间范围过滤总数和列表', async () => {
    const { service, postRepository } = buildService();

    await service.findPlaza({
      view: 'all',
      from: '2026-06-14',
      to: '2026-06-14',
      userId: 'user-1',
    } as any, 1, 15);

    const countSql = postRepository.query.mock.calls[0][0] as string;
    const countParams = postRepository.query.mock.calls[0][1] as unknown[];
    const listSql = postRepository.query.mock.calls[1][0] as string;
    const listParams = postRepository.query.mock.calls[1][1] as unknown[];

    expect(countSql).toContain('p.published_at >= ?');
    expect(countSql).toContain('p.published_at <= ?');
    expect(listSql).toContain('p.published_at >= ?');
    expect(listSql).toContain('p.published_at <= ?');
    expect(countParams).toEqual(['2026-06-14', '2026-06-14']);
    expect(listParams).toEqual(['user-1', '2026-06-14', '2026-06-14', 15, 0]);
  });

  it('收藏视图的收藏用户参数排在普通筛选参数之前', async () => {
    const { service, postRepository } = buildService();

    await service.findPlaza({
      view: 'favorites',
      platform: '小红书',
      from: '2026-06-14',
      to: '2026-06-14',
      userId: 'user-1',
    } as any, 2, 15);

    const countParams = postRepository.query.mock.calls[0][1] as unknown[];
    const listParams = postRepository.query.mock.calls[1][1] as unknown[];

    expect(countParams).toEqual(['user-1', '小红书', '2026-06-14', '2026-06-14']);
    expect(listParams).toEqual(['user-1', 'user-1', '小红书', '2026-06-14', '2026-06-14', 15, 15]);
  });
});
