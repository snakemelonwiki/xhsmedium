import { Injectable } from '@nestjs/common';
import { PostsService } from './posts.service';

@Injectable()
export class PostsMetricsService {
  constructor(private readonly postsService: PostsService) {}

  /**
   * Synchronous fetch metrics for a single post URL (legacy behavior preserved).
   * Uses Playwright to scrape the page directly.
   */
  async fetchMetricsFromUrl(url: string): Promise<any> {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) throw new Error('作品链接不能为空');

    const platform = this.detectPlatform(normalizedUrl);
    if (!platform) throw new Error('暂时只支持小红书和抖音作品链接');

    // Delegate to Playwright scraper
    const metrics = await this.scrapeMetrics(platform, normalizedUrl);

    const normalizedTitle = String(metrics.title || '')
      .replace(/\s*-\s*小红书\s*$/, '')
      .replace(/\s*-\s*抖音\s*$/, '')
      .trim();

    return {
      platform,
      title: normalizedTitle,
      likes: Number(metrics.likes || 0),
      comments: Number(metrics.comments || 0),
      favorites: Number(metrics.favorites || 0),
      metricsUpdatedAt: new Date().toISOString(),
    };
  }

  async openLoginBrowser(platform: string): Promise<any> {
    if (!platform || !['小红书', '抖音'].includes(platform)) {
      throw new Error('请选择要登录的平台');
    }
    // This is a placeholder — the actual Playwright logic is kept in the original file
    // and imported directly to avoid duplicating 400+ lines of scraping code.
    const { openLoginBrowser } = require('../../../../metricsFetcher');
    return openLoginBrowser(platform);
  }

  private detectPlatform(url: string): string {
    const value = url.toLowerCase();
    if (value.includes('xiaohongshu.com') || value.includes('xhslink.com')) return '小红书';
    if (value.includes('douyin.com')) return '抖音';
    return '';
  }

  private async scrapeMetrics(platform: string, targetUrl: string): Promise<any> {
    // Delegate to the existing metricsFetcher.js to avoid duplicating 400+ lines
    const { fetchMetricsFromUrl } = require('../../../../metricsFetcher');
    return fetchMetricsFromUrl(targetUrl);
  }
}
