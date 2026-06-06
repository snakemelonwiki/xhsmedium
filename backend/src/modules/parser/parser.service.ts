import { Injectable, Logger } from '@nestjs/common';
import { ScrapingLockService } from '../scraping/scraping-lock.service';
import { ScrapingAlertService } from '../scraping/scraping-alert.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parserCore = require('../../../../scripts/parser-core');

export interface ParserOptions {
  retry?: number;
  timeout?: number;
  /**
   * 业务来源标签，写入失败告警的 source 列。
   * 推荐值：'fetch-metrics' / 'refresh-metrics' / 'parse-link'。
   * 未传时默认 'parser'（兜底，不影响告警去重逻辑）。
   */
  source?: string;
  /** 关联作品 id（fetch-metrics / refresh-metrics 时回传，便于告警定位）。 */
  postId?: string;
}

export interface ParserSuccess {
  ok: true;
  data: {
    platform: string;
    title: string;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    /** 抓取截图：原图 / 缩略图（同源低分辨率图）。失败时为空串。 */
    coverImageUrl?: string;
    coverThumbUrl?: string;
    metricsUpdatedAt: string;
  };
}

export interface ParserFailure {
  ok: false;
  error: {
    code: string;
    retryable: boolean;
    message: string;
    platform: string;
  };
}

export type ParserResult = ParserSuccess | ParserFailure;

/**
 * Type guard: 排除 ParserSuccess 留下 ParserFailure
 */
export function isParserFailure(r: ParserResult): r is ParserFailure {
  return r.ok === false;
}

/**
 * 通用帖子解析服务：复用 scripts/parser-core.js 的 fetchWithRetry，
 * 给 NestJS 路由暴露为同步 Promise。
 *
 * 注意：通过 parserCore.fetchWithRetry 间接调用（而非 destructure），
 * 这样 jest.spyOn(parserCore, 'fetchWithRetry') 才能在测试中拦截。
 */
@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  constructor(
    private readonly lockService: ScrapingLockService,
    private readonly alertService: ScrapingAlertService,
  ) {}

  /**
   * 通用帖子解析服务。
   *
   * 链路：
   *   1. 先用 ScrapingLockService.run() 把抓取串行化（单进程同时只 1 个 + 8s 间隔 + 队列上限 20），
   *      队列满时抛 ServiceUnavailableException（controller 转 429）。
   *   2. 内部仍走 scripts/parser-core.js 的 fetchWithRetry（不要在这里重写抓取逻辑）。
   *   3. 成功 → ScrapingAlertService.recordSuccess(platform)，复位连续失败计数。
   *   4. 失败 → ScrapingAlertService.recordFailure({...})，
   *      触发「连续失败 3 次」或「累计 10/30/50/100 次」告警写库。
   *
   * 注意：通过 parserCore.fetchWithRetry 间接调用（而非 destructure），
   * 这样 jest.spyOn(parserCore, 'fetchWithRetry') 才能在测试中拦截。
   */
  async parse(url: string, opts: ParserOptions = {}): Promise<ParserResult> {
    const retry = Math.max(0, Number(opts.retry ?? 3));
    const timeout = Math.max(1000, Number(opts.timeout ?? 20000));
    const source = String(opts.source || 'parser');
    const log = (msg: string) => this.logger.debug?.(msg) ?? this.logger.log(msg);

    const result = (await this.lockService.run(() =>
      parserCore.fetchWithRetry(url, { retry, timeout, log }),
    )) as ParserResult;

    if (isParserFailure(result)) {
      // 失败：记一次到告警服务（写库失败不影响主流程）
      const platform = result.error?.platform || null;
      await this.alertService.recordFailure({
        platform,
        source,
        errorCode: result.error?.code || null,
        errorMessage: result.error?.message || null,
        postId: opts.postId || null,
        postUrl: url,
        context: { retry, timeout, retryable: !!result.error?.retryable },
      }).catch((err) => this.logger.warn(`recordFailure swallow: ${(err as any)?.message || err}`));
    } else {
      // 成功：复位连续失败（totalFailed 保留，YAGNI）
      this.alertService.recordSuccess(result.data?.platform || null);
    }

    return result;
  }

  /**
   * 错误分类（暴露给 controller 用于 HTTP 状态码映射）
   */
  classifyError(err: any) {
    return parserCore.classifyError(err);
  }

  // ---- 登录态管理 ----

  /**
   * 启动 headful 登录浏览器（带 UI，让用户扫码）
   * 注意：需要 GUI 环境（桌面系统）。服务器跑会失败。
   */
  async openLogin(platform: string) {
    this.assertPlatform(platform);
    return parserCore.openLoginBrowser(platform);
  }

  /**
   * 关闭已打开的登录浏览器
   */
  async closeLogin(platform: string) {
    this.assertPlatform(platform);
    return parserCore.closeLoginBrowser(platform);
  }

  /**
   * 查询某平台 profile 登录态（基于 Cookies 文件存在性）
   */
  getLoginStatus(platform: string) {
    this.assertPlatform(platform);
    return parserCore.getLoginStatus(platform);
  }

  /**
   * 同时查询 2 平台的登录态
   */
  getAllLoginStatus() {
    return ['小红书', '抖音'].map((p) => parserCore.getLoginStatus(p));
  }

  private assertPlatform(platform: string) {
    if (!['小红书', '抖音'].includes(platform)) {
      throw new Error(`不支持的平台: ${platform}，仅支持 小红书 / 抖音`);
    }
  }
}
