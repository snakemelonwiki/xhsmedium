import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ScrapingLockService } from '../scraping/scraping-lock.service';
import { ScrapingAlertService } from '../scraping/scraping-alert.service';
import { ScraperService, ProfileConfigService, ScrapingAccount } from '../scraping/core';
// V1 legacy: openLogin / closeLogin / getLoginStatus 仍走旧链路
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parserCore = require('../../../scripts/parser-core');

import { isScrapingFailure } from '../scraping/core/types';

/** 结果缓存条目 */
interface CacheEntry {
  data: ParserResult;
  /** 过期时间（ms epoch） */
  expiresAt: number;
}

/** 简单 LRU 缓存（基于 Map 的顺序语义） */
class SimpleCache {
  private readonly map = new Map<string, CacheEntry>();

  constructor(
    private readonly defaultTtlMs = 30000,
    private readonly maxSize = 1000,
  ) {}

  getCacheKey(url: string, account?: string): string {
    return account ? `${url}::${account}` : url;
  }

  get(url: string, account?: string): ParserResult | null {
    const key = this.getCacheKey(url, account);
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // LRU: 命中后移到末尾（最新）
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.data;
  }

  set(url: string, data: ParserResult, account?: string) {
    const key = this.getCacheKey(url, account);
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { data, expiresAt: Date.now() + this.defaultTtlMs });
  }

  clear() {
    this.map.clear();
  }
}

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
  /** 显式指定抓取账号 ID；不传时由 AccountRotationService 自动选择 */
  account?: string;
}

export interface ParserSuccess {
  ok: true;
  data: {
    platform: string;
    title: string;
    /** 作品文案/描述（抖音从页面 XPath 提取，小红书目前同 title） */
    copywriting?: string;
    /** 作者昵称（抖音/小红书页面解析） */
    authorName?: string;
    /** 作者平台 ID（抖音/小红书页面解析） */
    authorId?: string;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    /** 抓取截图：原图 / 缩略图（同源低分辨率图）。失败时为空串。 */
    coverImageUrl?: string;
    coverThumbUrl?: string;
    /** 发布日期（抖音/小红书页面解析，格式 YYYY-MM-DD） */
    publishedAt?: string;
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
    /** 实际使用过的账号 ID（多账号调试） */
    accountId?: string;
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
 * 通用帖子解析服务（V2 多账号版）。
 *
 * 链路：
 *   1. 先用 ScrapingLockService.run() 把抓取串行化。
 *   2. 内部走 ScraperService.scrape（支持按 account 指定或自动轮询）。
 *   3. 成功/失败分别由 ScrapingAlertService 记录。
 *
 * 优化（紧急修复队列满）：
 *   - 增加进程级结果缓存（30s TTL），同一 URL 短时间内复用结果，
 *     避免大量并发请求全部进入抓取队列。
 */
@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);
  /** 结果缓存：同一 URL 30s 内复用，减少队列压力 */
  private readonly resultCache = new SimpleCache(
    Number(process.env.PARSER_CACHE_TTL_MS || 30000),
    2000,
  );
  /**
   * In-flight Promise 去重：同一 URL+account 正在抓取时，后续并发请求复用该 Promise，
   * 避免穿透 resultCache 瞬间填满抓取队列。
   */
  private readonly inflight = new Map<string, Promise<ParserResult>>();

  constructor(
    private readonly lockService: ScrapingLockService,
    private readonly alertService: ScrapingAlertService,
    private readonly scraperService: ScraperService,
    private readonly profileConfig: ProfileConfigService,
  ) {}

  /**
   * 通用帖子解析。
   */
  async parse(url: string, opts: ParserOptions = {}): Promise<ParserResult> {
    const retry = Math.max(0, Number(opts.retry ?? 3));
    const timeout = Math.max(1000, Number(opts.timeout ?? 20000));
    const source = String(opts.source || 'parser');
    const log = (msg: string) => this.logger.debug?.(msg) ?? this.logger.log(msg);

    // 紧急修复：优先读缓存，避免重复请求全部压入抓取队列
    const cached = this.resultCache.get(url, opts.account);
    if (cached) {
      this.logger.debug(`[Parser] 缓存命中: ${url.slice(0, 80)}`);
      return cached;
    }

    // P0 修复：in-flight Promise 去重，避免并发请求同一 URL 穿透缓存瞬间填满队列
    const cacheKey = this.resultCache.getCacheKey(url, opts.account);
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      this.logger.debug(`[Parser] 复用进行中的请求: ${url.slice(0, 80)}`);
      return existing;
    }

    const promise = (async (): Promise<ParserResult> => {
      const result = await this.lockService.run(() =>
        this.scraperService.scrape(url, { retry, timeout, log, account: opts.account, autoSwitch: false }),
      );

      // 写入缓存：只缓存成功结果；失败结果（无论是否可重试）一律不缓存，
      // 让下次请求重新尝试，避免风控/临时错误被长期缓存。
      const parserResult = result as ParserResult;
      if (!isScrapingFailure(result)) {
        this.resultCache.set(url, parserResult, opts.account);
      }

      if (isScrapingFailure(result)) {
        const platform = result.error.platform || null;
        await this.alertService.recordFailure({
          platform,
          source,
          errorCode: result.error.code || null,
          errorMessage: result.error.message || null,
          postId: opts.postId || null,
          postUrl: url,
          context: { retry, timeout, retryable: result.error.retryable, account: opts.account },
        }).catch((err) => this.logger.warn(`recordFailure swallow: ${(err as any)?.message || err}`));
      } else {
        this.alertService.recordSuccess(result.data?.platform || null, source)
          .catch((err) => this.logger.warn(`recordSuccess swallow: ${(err as any)?.message || err}`));
      }

      return parserResult;
    })();

    this.inflight.set(cacheKey, promise);
    promise.finally(() => {
      this.inflight.delete(cacheKey);
    }).catch(() => {});

    return promise;
  }

  /**
   * 错误分类（暴露给 controller 用于 HTTP 状态码映射）
   */
  classifyError(err: any) {
    const msg = String(err?.message || err);
    const TRANSIENT_PATTERNS = [/ECONNRESET/i, /ETIMEDOUT/i, /ERR_NETWORK_CHANGED/i, /net::ERR_/i, /TimeoutError/i, /Navigation timeout/i];
    const LOGIN_WALL_PATTERNS = [/登录页/, /登录后/, /未登录/];
    if (LOGIN_WALL_PATTERNS.some((re) => re.test(msg))) {
      return { code: 'login_required', retryable: false, message: msg };
    }
    if (TRANSIENT_PATTERNS.some((re) => re.test(msg))) {
      return { code: 'transient', retryable: true, message: msg };
    }
    return { code: 'unknown', retryable: false, message: msg };
  }

  // ---- 账号状态查询 ----

  /**
   * 列出某个平台或所有抓取账号。
   */
  listScrapingAccounts(platform?: string): ScrapingAccount[] {
    return this.profileConfig.listAccounts(platform);
  }

  /**
   * 查询某个平台或所有抓取账号的登录态（基于 Cookies 文件存在性）。
   */
  getScrapingAccountStatus(platform?: string): any {
    const accounts = this.listScrapingAccounts(platform);
    return accounts.map((a) => {
      const cookiesPath = this.locateCookies(a.profileDir);
      const hasSession = cookiesPath !== null;
      return {
        id: a.id,
        platform: a.platform,
        label: a.label,
        profileDir: a.profileDir,
        enabled: a.enabled,
        isDefault: a.isDefault,
        hasSession,
        cookieSize: hasSession ? this.getFileSize(cookiesPath!) : 0,
        cookiePath: hasSession ? cookiesPath : null,
      };
    });
  }

  // ---- 登录态管理 ----

  /**
   * T10.2 占位实现：图片 OCR 识别。
   */
  async parseImage(file: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
    size?: number;
  }): Promise<{
    ok: true;
    data: {
      title: string;
      accountName: string;
      platform: string;
      text: string;
      ocr: 'placeholder';
      warning?: string;
    };
  }> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new Error('请上传图片文件');
    }
    return {
      ok: true,
      data: {
        title: '',
        accountName: '',
        platform: '',
        text: '',
        ocr: 'placeholder',
        warning: '后端尚未启用 OCR 引擎，请手动补充标题与账号',
      },
    };
  }

  /**
   * 启动 headful 登录浏览器（带 UI，让用户扫码）。
   * 按 accountId 解析出对应 profile 目录后传给底层，保证登录态落到正确账号目录：
   *   - 默认账号 → .playwright-profiles/{douyin|xiaohongshu}
   *   - 子账号   → .playwright-profiles/accounts/<code>/<id>
   */
  async openLogin(platform: string, accountId?: string) {
    this.assertPlatform(platform);
    const account = this.resolveAccountOrThrow(platform, accountId);
    return parserCore.openLoginBrowser(platform, account.profileDir);
  }

  /**
   * 关闭已打开的登录浏览器。
   * 传入 accountId 时只关闭该账号的登录浏览器；否则关闭该平台下所有登录浏览器。
   */
  async closeLogin(platform: string, accountId?: string) {
    this.assertPlatform(platform);
    if (!accountId) {
      return parserCore.closeLoginBrowser(platform);
    }
    const account = this.resolveAccountOrThrow(platform, accountId);
    return parserCore.closeLoginBrowser(platform, account.profileDir);
  }

  /**
   * 查询某平台指定账号（缺省为默认账号）的 profile 登录态。
   */
  getLoginStatus(platform: string, accountId?: string) {
    this.assertPlatform(platform);
    if (!accountId) {
      return parserCore.getLoginStatus(platform);
    }
    const account = this.resolveAccountOrThrow(platform, accountId);
    return parserCore.getLoginStatus(platform, account.profileDir);
  }

  /**
   * 同时查询 2 平台默认账号的登录态
   */
  getAllLoginStatus() {
    return ['小红书', '抖音'].map((p) => parserCore.getLoginStatus(p));
  }

  private assertPlatform(platform: string) {
    if (!['小红书', '抖音'].includes(platform)) {
      throw new Error(`不支持的平台: ${platform}，仅支持 小红书 / 抖音`);
    }
  }

  /**
   * 解析账号配置：accountId 缺省时取默认账号；显式指定但找不到/已禁用时抛错，
   * 避免静默回退到默认账号目录导致登录态写错位置。
   */
  private resolveAccountOrThrow(platform: string, accountId?: string): ScrapingAccount {
    if (accountId) {
      const account = this.profileConfig.getAccount(platform, accountId);
      if (!account || account.id !== accountId || !account.enabled) {
        throw new Error(`抓取账号 ${accountId}（${platform}）不存在或已禁用`);
      }
      return account;
    }
    const fallback = this.profileConfig.getDefaultAccount(platform);
    if (!fallback) {
      throw new Error(`平台 ${platform} 无可用抓取账号`);
    }
    return fallback;
  }

  private locateCookies(profileDir: string): string | null {
    const candidates = [
      path.join(profileDir, 'Default', 'Network', 'Cookies'),
      path.join(profileDir, 'Default', 'Cookies'),
      path.join(profileDir, 'Cookies'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        return p;
      }
    }
    return null;
  }

  private getFileSize(p: string): number {
    try {
      return fs.statSync(p).size;
    } catch {
      return 0;
    }
  }
}
