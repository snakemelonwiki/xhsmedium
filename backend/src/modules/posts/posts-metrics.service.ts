import { Injectable, Logger } from '@nestjs/common';
import { isParserFailure, ParserService } from '../parser/parser.service';
import { CacheService } from '../../shared/cache.service';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

export interface ScrapedMetrics {
  platform: string;
  title: string;
  /** 作品文案/描述（抖音从页面 XPath 提取） */
  copywriting?: string;
  authorName?: string;
  authorId?: string;
  likes: number;
  comments: number;
  favorites: number;
  shares?: number;
  /** 抓取时同步截的封面（低分辨率 jpeg，可直接当 coverImageUrl + coverThumbUrl） */
  coverImageUrl?: string;
  coverThumbUrl?: string;
  /** 发布日期（小红书从页面解析到的 YYYY-MM-DD） */
  publishedAt?: string;
  /**
   * 抓取时间戳。
   * 用 Date 类型以匹配 postsService.updateMetrics 的入参约束（DB 写入要 Date），
   * 控制器在 res.json() 时再 .toISOString() 转字符串。
   */
  metricsUpdatedAt: Date;
}

/**
 * 作品指标抓取服务：NestJS 包装层。
 *
 * - 抓取能力走 ParserService（透传到 scripts/parser-core.js 的 fetchWithRetry），
 *   拿到自动重试（默认 3 次，指数退避 1s/2s/4s/8s）+ 错误分类 + 明确 HTTP 状态码。
 * - 不再直接 require('../../../metricsFetcher')，与 legacy 文件的耦合点只剩
 *   parser-core.js 一处，模块边界更清晰。
 * - 本服务不依赖 PostsService，避免与 PostsService 形成循环依赖。
 */
@Injectable()
export class PostsMetricsService {
  private readonly logger = new Logger(PostsMetricsService.name);

  constructor(
    private readonly parserService: ParserService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 抓取帖子指标并规范化为 NestJS 调用方可直接使用的字段。
   * 失败抛 Error，错误信息由 parser-core 透传（已含分类与中文消息）。
   *
   * 抓取内部会走 ScrapingLockService 串行化，失败时由 ScrapingAlertService
   * 计数并按规则写 scraping_alerts 告警（本方法不直接处理）。
   */
  async fetchMetricsFromUrl(
    url: string,
    opts: { source?: string; postId?: string } = {},
  ): Promise<ScrapedMetrics> {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) throw new Error('作品链接不能为空');

    // ── 缓存命中：同 URL 5 分钟内直接返回 ──
    const cacheKey = `metrics:${normalizedUrl}`;
    const cached = this.cacheService.get<ScrapedMetrics>(cacheKey);
    if (cached) {
      this.logger.log(`[metrics] 缓存命中: ${normalizedUrl}`);
      return { ...cached, metricsUpdatedAt: new Date(cached.metricsUpdatedAt) };
    }

    const isInteractive = (opts.source || 'fetch-metrics') === 'parse-link';
    const result = await this.parserService.parse(normalizedUrl, {
      retry: isInteractive ? 0 : 2,
      timeout: isInteractive ? 20_000 : 15_000,
      source: opts.source || 'fetch-metrics',
      postId: opts.postId,
    });
    if (isParserFailure(result)) {
      // 透传错误信息，让 controller 用对应 HTTP 状态码返回
      throw new Error(result.error.message);
    }
    const d = result.data;
    const scraped: ScrapedMetrics = {
      platform: d.platform,
      title: d.title,
      copywriting: d.copywriting || undefined,
      authorName: d.authorName || undefined,
      authorId: d.authorId || undefined,
      likes: Number(d.likes || 0),
      comments: Number(d.comments || 0),
      favorites: Number(d.favorites || 0),
      shares: Number(d.shares || 0),
      coverImageUrl: d.coverImageUrl || '',
      coverThumbUrl: d.coverThumbUrl || '',
      publishedAt: d.publishedAt || undefined,
      metricsUpdatedAt: d.metricsUpdatedAt ? new Date(d.metricsUpdatedAt) : new Date(),
    };
    this.cacheService.set(cacheKey, scraped, CACHE_TTL_MS);
    this.logger.log(`[metrics] 抓取成功并缓存: ${normalizedUrl} (赞${scraped.likes} 评${scraped.comments} 藏${scraped.favorites})`);
    return scraped;
  }

  /**
   * 启动有头登录浏览器。GUI 环境（Windows / macOS 桌面）。
   */
  async openLoginBrowser(platform: string): Promise<any> {
    if (!platform || !['小红书', '抖音'].includes(platform)) {
      throw new Error('请选择要登录的平台');
    }
    return this.parserService.openLogin(platform);
  }
}
