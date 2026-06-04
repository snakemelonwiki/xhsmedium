import { PostsController } from './posts.controller';

describe('PostsController permissions', () => {
  const buildController = (post: any) => {
    const postsService = {
      findById: jest.fn().mockResolvedValue(post),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    return { controller, postsService, response };
  };

  it('拒绝 staff 修改他人作品', async () => {
    const { controller, postsService, response } = buildController({
      id: 'post-1',
      employeeId: 'employee-owner',
    });
    const request = { session: { role: 'staff', employeeId: 'employee-other' } } as any;

    await controller.update('post-1', { title: '越权修改' }, request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(postsService.update).not.toHaveBeenCalled();
  });

  it('拒绝 staff 删除他人作品', async () => {
    const { controller, postsService, response } = buildController({
      id: 'post-1',
      employeeId: 'employee-owner',
    });
    const request = { session: { role: 'staff', employeeId: 'employee-other' } } as any;

    await controller.remove('post-1', request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(postsService.remove).not.toHaveBeenCalled();
  });
});

describe('PostsController pagination', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('默认按 20 条分页返回作品列表', async () => {
    const postsService = {
      findPaged: jest.fn().mockResolvedValue({ total: 21, items: [{ id: 'post-1' }], limit: 20, offset: 0 }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.findAll({ session: { role: 'admin', userId: '' } } as any, res, '20', '0');

    expect(postsService.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({}),
      20,
      0,
    );
    expect(res.json).toHaveBeenCalledWith({ total: 21, items: [{ id: 'post-1' }], limit: 20, offset: 0 });
  });

  it('支持 limit/offset 查询参数', async () => {
    const postsService = {
      findPaged: jest.fn().mockResolvedValue({ total: 30, items: [{ id: 'post-11' }], limit: 10, offset: 10 }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.findAll({ session: { role: 'staff', employeeId: 'emp-1', userId: '' } } as any, res, '10', '10');

    expect(postsService.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'emp-1' }),
      10,
      10,
    );
    expect(res.json).toHaveBeenCalledWith({ total: 30, items: [{ id: 'post-11' }], limit: 10, offset: 10 });
  });
});

describe('PostsController A端契约补齐', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('解析作品链接时返回平台和兜底标题', async () => {
    const postsService = {
      parsePostLink: jest.fn().mockResolvedValue({
        platform: '小红书',
        postUrl: 'https://www.xiaohongshu.com/explore/abc',
        title: '小红书作品',
        authorName: '测试作者',
        authorId: 'xhs_user_123',
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
        parsed: false,
      }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.parseLink({ postUrl: 'https://www.xiaohongshu.com/explore/abc' }, res);

    expect(postsService.parsePostLink).toHaveBeenCalledWith(
      'https://www.xiaohongshu.com/explore/abc',
      { fetch: true },
    );
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: {
        platform: '小红书',
        postUrl: 'https://www.xiaohongshu.com/explore/abc',
        title: '小红书作品',
        authorName: '测试作者',
        authorId: 'xhs_user_123',
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
        parsed: false,
      },
    });
  });

  it('解析作品链接抓取失败时返回降级数据', async () => {
    const postsService = {
      parsePostLink: jest.fn().mockResolvedValue({
        platform: '小红书',
        postUrl: 'https://www.xiaohongshu.com/explore/locked',
        title: '小红书作品',
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
        parsed: false,
        warning: '当前打开的是小红书登录页，请先打开小红书登录浏览器完成一次登录。',
      }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.parseLink({ postUrl: 'https://www.xiaohongshu.com/explore/locked' }, res);

    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      data: expect.objectContaining({
        platform: '小红书',
        parsed: false,
        warning: expect.stringContaining('登录'),
      }),
    });
  });

  it('解析作品链接支持 fetch:false 关闭抓取', async () => {
    const postsService = {
      parsePostLink: jest.fn().mockResolvedValue({
        platform: '抖音',
        postUrl: 'https://v.douyin.com/abc',
        title: '抖音作品',
        likes: 0,
        comments: 0,
        favorites: 0,
        shares: 0,
        parsed: false,
      }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.parseLink({ postUrl: 'https://v.douyin.com/abc', fetch: false }, res);

    expect(postsService.parsePostLink).toHaveBeenCalledWith('https://v.douyin.com/abc', { fetch: false });
  });

  it('创建作品时遇到重复链接返回 409', async () => {
    const postsService = {
      findDuplicateByUrl: jest.fn().mockResolvedValue({ id: 'post-existing', title: '已存在作品' }),
      create: jest.fn(),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.create({ postUrl: 'https://example.com/post', title: '新作品' }, { session: { employeeId: 'emp-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('兼容 PATCH 更新作品', async () => {
    const postsService = {
      findById: jest.fn().mockResolvedValue({ id: 'post-1', employeeId: 'emp-1' }),
      findDuplicateByUrl: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.patch('post-1', { title: '新标题' }, { session: { role: 'staff', employeeId: 'emp-1' } } as any, res);

    expect(postsService.update).toHaveBeenCalledWith('post-1', expect.objectContaining({ title: '新标题' }));
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('手动写入作品指标时同步主表并记录历史', async () => {
    const postsService = {
      findById: jest.fn().mockResolvedValue({ id: 'post-1' }),
      updateMetrics: jest.fn(),
      recordMetricsHistory: jest.fn(),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.saveMetrics('post-1', { likes: 10, comments: 2, favorites: 3, shares: 4 }, {} as any, res);

    expect(postsService.updateMetrics).toHaveBeenCalledWith('post-1', expect.objectContaining({
      likes: 10,
      comments: 2,
      favorites: 3,
      shares: 4,
    }));
    expect(postsService.recordMetricsHistory).toHaveBeenCalledWith('post-1', expect.objectContaining({ shares: 4 }));
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('读取作品指标历史', async () => {
    const postsService = {
      getMetricsHistory: jest.fn().mockResolvedValue([{ id: 'metric-1', likes: 12 }]),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();

    await controller.getMetrics('post-1', res);

    expect(postsService.getMetricsHistory).toHaveBeenCalledWith('post-1');
    expect(res.json).toHaveBeenCalledWith({ items: [{ id: 'metric-1', likes: 12 }] });
  });
});

describe('PostsController v1.3 OP-8 学习榜单维度切换', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('learning-board 透传 dimension/days/platform/limit 给 service', async () => {
    const postsService = {
      getLearningBoard: jest.fn().mockResolvedValue({ dimension: 'traffic', items: [] }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();
    const req = { session: { role: 'admin', employeeId: 'emp-1' } } as any;

    await controller.getLearningBoard(req, res, 'traffic', '14', '小红书', '10');

    expect(postsService.getLearningBoard).toHaveBeenCalledWith(
      {
        dimension: 'traffic',
        days: 14,
        platform: '小红书',
        limit: 10,
      },
      { employeeId: 'emp-1', role: 'admin' },
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true, dimension: 'traffic', items: [] });
  });

  it('learning-board 缺省参数时使用 service 默认值', async () => {
    const postsService = {
      getLearningBoard: jest.fn().mockResolvedValue({ dimension: 'composite', items: [] }),
    } as any;
    const controller = new PostsController(postsService, {} as any, { log: jest.fn() } as any);
    const res = response();
    const req = { session: { role: 'staff', employeeId: 'emp-2' } } as any;

    await controller.getLearningBoard(req, res);

    expect(postsService.getLearningBoard).toHaveBeenCalledWith(
      {
        dimension: undefined,
        days: 30,
        platform: undefined,
        limit: 20,
      },
      { employeeId: 'emp-2', role: 'staff' },
    );
  });
});
