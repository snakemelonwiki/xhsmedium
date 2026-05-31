import { PostsController } from './posts.controller';

describe('PostsController refresh metrics', () => {
  it('批量刷新失败结果包含失败原因', async () => {
    const postsService = {
      findAll: jest.fn().mockResolvedValue([{ id: 'post-1', postUrl: 'https://example.com/post' }]),
      updateMetrics: jest.fn(),
      saveMetricsHistory: jest.fn(),
    } as any;
    const postsMetricsService = {
      fetchMetricsFromUrl: jest.fn().mockRejectedValue(new Error('登录已失效')),
    } as any;
    const controller = new PostsController(postsService, postsMetricsService);
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;

    await controller.refreshMetrics({}, response);

    expect(response.json).toHaveBeenCalledWith({
      ok: true,
      scoped: false,
      requested: 1,
      refreshed: 0,
      failed: 1,
      results: [expect.objectContaining({ id: 'post-1', success: false, reason: '登录已失效' })],
    });
  });
});
