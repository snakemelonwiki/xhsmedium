import { PostsMetricsService } from './posts-metrics.service';

jest.mock('../../../../metricsFetcher', () => ({
  fetchMetricsFromUrl: jest.fn(),
}), { virtual: true });

describe('PostsMetricsService', () => {
  it('刷新指标时保留分享数', async () => {
    const { fetchMetricsFromUrl } = require('../../../../metricsFetcher');
    fetchMetricsFromUrl.mockResolvedValue({
      title: '测试作品 - 小红书',
      likes: 10,
      comments: 2,
      favorites: 3,
      shares: 4,
    });
    const service = new PostsMetricsService({} as any);

    const metrics = await service.fetchMetricsFromUrl('https://www.xiaohongshu.com/explore/test');

    expect(metrics).toMatchObject({
      platform: '小红书',
      title: '测试作品',
      likes: 10,
      comments: 2,
      favorites: 3,
      shares: 4,
    });
  });
});
