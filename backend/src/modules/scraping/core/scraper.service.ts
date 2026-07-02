import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { resolveRepoRoot } from '../../../shared/utils/project-paths';
import { BrowserPoolService } from './browser-pool.service';
import { AccountRotationService } from './account-rotation.service';
import { ProfileConfigService, ScrapingAccount } from './profile-config.service';
import { HarListener } from './har-listener';
import { XiaohongshuExtractor } from './extractors/xiaohongshu.extractor';
import { DouyinExtractor } from './extractors/douyin.extractor';
import { parseUrl, resolveParsedAfterNavigation } from './url-parser';
import {
  ScrapedPostData,
  ScrapingOptions,
  ScrapingResult,
  UrlParseResult,
  HarSnapshot,
} from './types';

const DEFAULT_TIMEOUT = 15000;
const NAVIGATION_TIMEOUT = 15000;
const BLOCKED_RESOURCE_TYPES = new Set([
  'image',
  'stylesheet',
  'font',
  'media',
  'websocket',
  'eventsource',
]);

/**
 * 统一抓取服务（多账号版）
 *
 * 核心职责：
 *   1. URL 分类（parseUrl）
 *   2. 账号选择（AccountRotationService / 显式指定）
 *   3. 获取浏览器上下文（BrowserPoolService，按 platform:accountId 隔离）
 *   4. 挂载 HAR 监听器
 *   5. 页面导航 + 去浮层
 *   6. 数据提取（XiaohongshuExtractor / DouyinExtractor）
 *   7. 截图封面
 *   8. 登录墙检测
 *   9. 错误分类、账号内重试、账号间切换
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly xhsExtractor = new XiaohongshuExtractor();
  private readonly douyinExtractor = new DouyinExtractor();
  /** 按平台串行化抓取，避免多个请求共享同一个 persistent context 导致 newPage 时上下文被关闭。 */
  private readonly platformLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly browserPool: BrowserPoolService,
    private readonly rotationService: AccountRotationService,
    private readonly profileConfig: ProfileConfigService,
  ) {}

  /**
   * 主入口：抓取单个 URL
   *
   * 多账号逻辑：
   *   1. 如果 opts.account 指定了账号，优先使用该账号。
   *   2. 否则用 AccountRotationService 选择下一个可用账号。
   *   3. 抓取过程中若遇到「可切换错误」（登录墙/风控/频繁），在账号间轮转，
   *      直到成功或所有账号都尝试过。
   */
  async scrape(url: string, opts: ScrapingOptions = {}): Promise<ScrapingResult> {
    const log = opts.log || ((msg: string) => this.logger.log(msg));
    const retry = Math.max(0, Number(opts.retry ?? 3));
    const timeout = Math.max(1000, Number(opts.timeout ?? 20000));
    const autoSwitch = opts.autoSwitch !== false;

    // 1. URL 分类
    const parsed = parseUrl(url);
    if (!parsed.platform) {
      return {
        ok: false,
        error: {
          code: 'platform_unsupported',
          retryable: false,
          message: 'URL 不属于小红书或抖音',
          platform: '',
        },
      };
    }

    const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
    log(`URL 分类: platform=${parsed.platform}, linkType=${parsed.linkType}, postId=${parsed.postId || 'null'}`);

    return this.withPlatformLock(platform, async () => {
      const triedAccounts: string[] = [];
      let lastErr: Error | null = null;

      while (true) {
        // 选取账号
        const account = this.selectAccount(platform, {
          prefer: opts.account,
          exclude: triedAccounts,
          autoSwitch,
        });

        if (!account) {
          // 无可用账号
          const lastMessage = lastErr ? lastErr.message : '所有账号均不可用';
          return {
            ok: false,
            error: {
              code: 'exhausted',
              retryable: false,
              message: lastMessage,
              platform,
            },
          };
        }

        triedAccounts.push(account.id);

        try {
          log(`使用账号 ${account.label}（${account.id}）抓取 ${platform}`);
          const data = await this.doScrapeWithAccount(parsed, account, { retry, timeout, log });
          this.rotationService.recordSuccess(platform, account.id);
          log(`抓取结果 ${platform}: title=${(data.title || '').slice(0, 60)}, publishedAt=${data.publishedAt || ''}`);
          return { ok: true, data };
        } catch (err: any) {
          lastErr = err;
          const isSwitchable = this.rotationService.isAccountSwitchableError(err);
          if (isSwitchable) {
            this.rotationService.recordFailure(platform, account.id);
            log(`账号 ${account.id} 失败且可切换: ${err?.message}`);
            // 继续循环，尝试下一个账号
          } else {
            // 不可切换错误（作品删除、平台不支持等），直接返回
            const cls = this.classifyError(err);
            return {
              ok: false,
              error: { ...cls, platform, accountId: account.id },
            };
          }
        }
      }
    });
  }

  // ── 账号选择 ──

  private selectAccount(
    platform: string,
    options: { prefer?: string; exclude: string[]; autoSwitch: boolean },
  ): ScrapingAccount | null {
    if (options.prefer) {
      const explicit = this.profileConfig.getAccount(platform, options.prefer);
      if (explicit && explicit.enabled) return explicit;
      // 显式指定但找不到/禁用时，继续走自动逻辑
    }
    if (options.autoSwitch) {
      return this.rotationService.nextAccount(platform, { exclude: options.exclude });
    }
    // 不自动切换时，只尝试一次默认账号
    if (options.exclude.length === 0) {
      return this.profileConfig.getDefaultAccount(platform);
    }
    return null;
  }

  /**
   * 按平台串行锁：保证同一平台同时只有一个抓取任务在执行，
   * 避免多个请求共享 persistent context 时被互相关闭。
   *
   * 实现：使用双重 Map 序列化获取锁（非并行获取）。
   *   - lockAcquires: 存储正在获取锁的请求，先到的先拿
   *   - platformLocks: 存储当前持有锁的 Promise
   * 先等 lockAcquires 清空，再等 platformLocks 清空，最后拿到锁。
   */
  private readonly lockAcquires = new Map<string, Promise<void>>();

  private async withPlatformLock<T>(platform: string, fn: () => Promise<T>): Promise<T> {
    // 1. 等待所有正在获取该锁的请求完成
    while (this.lockAcquires.has(platform)) {
      try {
        await this.lockAcquires.get(platform)!;
      } catch {
        // 前一个任务失败也不影响当前任务
      }
    }

    // 2. 标记自己正在获取锁
    let resolveAcquire: () => void;
    const acquirePromise = new Promise<void>((resolve) => {
      resolveAcquire = resolve;
    });
    this.lockAcquires.set(platform, acquirePromise);

    try {
      // 3. 再次检查是否有当前锁（等待期间可能被其他请求设置了）
      while (this.platformLocks.has(platform)) {
        try {
          await this.platformLocks.get(platform)!;
        } catch {
          // 忽略前一个任务的失败
        }
      }

      // 4. 获取锁
      let release: () => void;
      const lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.platformLocks.set(platform, lock);

      try {
        return await fn();
      } finally {
        this.platformLocks.delete(platform);
        release!();
      }
    } finally {
      this.lockAcquires.delete(platform);
      resolveAcquire!();
    }
  }

  /**
   * 核心抓取逻辑（单账号单次，内部支持重试）
   */
  private async doScrapeWithAccount(
    parsed: UrlParseResult,
    account: ScrapingAccount,
    opts: { retry: number; timeout: number; log: (msg: string) => void },
  ): Promise<ScrapedPostData> {
    const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= opts.retry; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
        opts.log(`账号 ${account.id} 重试 ${attempt}/${opts.retry}，等待 ${backoff}ms`);
        await sleep(backoff);
      }

      try {
        opts.log(`第 ${attempt + 1} 次抓取 ${platform}: ${parsed.normalizedUrl}`);
        const data = await this.doScrape(parsed, account, { timeout: opts.timeout, log: opts.log });
        return data;
      } catch (err: any) {
        lastErr = err;
        const cls = this.classifyError(err);
        opts.log(`第 ${attempt + 1} 次失败 [${cls.code}]: ${cls.message}`);
        if (!cls.retryable || attempt === opts.retry) {
          throw err; // 重试耗尽，抛给外层做账号切换判断
        }
      }
    }

    throw lastErr || new Error('重试用尽');
  }

  /**
   * 单次抓取（无重试）
   */
  private async doScrape(
    parsed: UrlParseResult,
    account: ScrapingAccount,
    opts: { timeout: number; log: (msg: string) => void },
  ): Promise<ScrapedPostData> {
    const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
    let ctx = await this.browserPool.acquireContext(platform, account.id);
    let page: Page | null = null;
    const t0 = Date.now();

    try {
      try {
        page = await ctx.newPage();
      } catch (err: any) {
        if (!err?.message?.includes('closed')) throw err;
        this.logger.warn(`[Scraper] ${platform} 上下文在 newPage 时已被关闭，尝试重建`);
        await this.browserPool.releaseContext(platform, account.id);
        ctx = await this.browserPool.acquireContext(platform, account.id);
        page = await ctx.newPage();
      }

      // 抖音：拦截 websocket/eventsource，其余放行
      if (platform === '抖音') {
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'websocket' || type === 'eventsource') {
            route.abort();
          } else {
            route.continue();
          }
        });
      }

      // ── 挂载 HAR 监听器 ──
      const harListener = new HarListener(page, {
        urlFilter: [
          /\/api\/sns\/web\/v[12]\/feed/i,
          /\/api\/sns\/web\/v\d+\/note\b/i,
          /\/aweme\/v1\/web\/aweme\/detail\//i,
          /\/aweme\/v1\/web\/aweme\/post\//i,
          /\/aweme\/v1\/web\/aweme\/related\//i,
          /\/aweme\/v2\/web\/aweme\/stats\//i,
          /RENDER_DATA/i,
        ],
        excludeResourceTypes: new Set([
          'image',
          'stylesheet',
          'font',
          'media',
          'websocket',
          'eventsource',
        ]),
        maxEntries: 100,
      });
      harListener.start();

      // ── 导航 ──
      await page.goto(parsed.normalizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });

      // 等待页面稳定
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      if (platform === '抖音') {
        await page.waitForTimeout(1000);
      } else {
        await page.waitForTimeout(500);
      }

      // ── 短链/重定向后回写真实 URL + postId ──
      const finalUrl = page.url();

      // ── 小红书失效作品：跳转到 /404 错误页（query 携带 errorCode，如 -510000）──
      // 该跳转不会被 resolveParsedAfterNavigation 的 mismatch 捕获（/404 解析出的 postId 为 null），
      // 且 404 页无 "笔记不存在" 等文案，故需专门按 URL 判定，避免把死链录成空标题 0 指标的正常笔记。
      if (platform === '小红书' && this.isXiaohongshu404Url(finalUrl)) {
        this.logger.warn(`[Scraper] 小红书笔记已失效（跳转到 404 页）: requested=${parsed.normalizedUrl}, final=${finalUrl}`);
        throw new Error('小红书笔记已失效，可能已被删除、隐藏或下架（页面跳转至 404）');
      }

      if (finalUrl && finalUrl !== parsed.normalizedUrl) {
        const resolution = resolveParsedAfterNavigation(parsed, finalUrl);
        if (resolution.mismatch) {
          throw new Error(
            `${platform}作品已删除或已跳转到其他作品页（请求ID=${resolution.requestedPostId}，实际ID=${resolution.actualPostId || 'unknown'}）`,
          );
        }
        parsed = resolution.parsed;
        opts.log(`重定向后 URL: ${finalUrl}, postId=${parsed.postId || 'null'}`);
      }

      // ── 登录墙检测：先取原始 body 文本，避免 dismissObstacles 误删主容器后取不到帖子信号 ──
      const pageTitle = await page.title().catch(() => '');
      const bodyTextRaw = await page.locator('body').innerText().catch(() => '');

      // ── 去浮层 ──
      await this.dismissObstacles(page, platform).catch(() => {});

      if (this.isLoginWall(platform, bodyTextRaw, pageTitle)) {
        throw new Error(
          `当前打开的是${platform}登录页/登录弹窗，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`,
        );
      }

      // ── 小红书笔记删除/失效检测 ──
      if (platform === '小红书' && this.isXiaohongshuNoteDeleted(bodyTextRaw, pageTitle)) {
        this.logger.warn(`[Scraper] ${platform} 笔记已失效/被删除: url=${parsed.normalizedUrl}, postId=${parsed.postId || 'null'}`);
        throw new Error('小红书笔记已失效，可能已被删除、隐藏或下架');
      }

      // ── 抖音作品删除/失效检测 ──
      if (platform === '抖音' && this.isDouyinPostDeleted(bodyTextRaw, pageTitle)) {
        this.logger.warn(`[Scraper] ${platform} 作品已被删除/隐藏/下架: url=${parsed.normalizedUrl}, postId=${parsed.postId || 'null'}`);
        throw new Error('抖音作品已被删除，页面提示"你要观看的图文不存在"');
      }

      // 去浮层后再取一份 bodyText 用于兜底指标提取
      const bodyText = await page.locator('body').innerText().catch(() => bodyTextRaw);

      // ── 读取 SSR 数据 ──
      const ssrExtracted = await this.extractSsrData(page, parsed.postId);

      opts.log(`SSR ${ssrExtracted ? `OK (${(ssrExtracted as any)._source}): 赞${(ssrExtracted as any).likes} 评${(ssrExtracted as any).comments}` : '空'}`);

      // ── 停止 HAR 收集 ──
      const har = harListener.stop();

      // ── 抖音失效作品兜底检测（基于 RSC 失效包装对象，不依赖客户端跳转时序）──
      if (platform === '抖音') {
        const deleted = this.douyinExtractor.detectDeletedPost(har, parsed.postId);
        if (deleted) {
          this.logger.warn(`[Scraper] ${platform} 作品已失效/被删除: url=${parsed.normalizedUrl}, postId=${parsed.postId || 'null'}, ${deleted.reason}`);
          throw new Error(`抖音作品已失效或已被删除（${deleted.reason}）`);
        }
      }

      // ── 数据提取 ──
      const data = this.extractData(platform, har, ssrExtracted, parsed);

      // 降级到 DOM 文本分析
      const fallback = this.extractFromBodyText(bodyText);
      data.likes = this.mergeMetric(data.likes, fallback.likes);
      data.comments = this.mergeMetric(data.comments, fallback.comments);
      data.favorites = this.mergeMetric(data.favorites, fallback.favorites);
      data.shares = this.mergeMetric(data.shares, fallback.shares);

      // 补齐必填字段
      const finalData: ScrapedPostData = {
        platform: data.platform || platform,
        title: data.title || '',
        copywriting: data.copywriting || '',
        authorName: data.authorName || '',
        authorId: data.authorId || '',
        likes: Number(data.likes) || 0,
        comments: Number(data.comments) || 0,
        favorites: Number(data.favorites) || 0,
        shares: Number(data.shares) || 0,
        publishedAt: data.publishedAt || '',
        metricsUpdatedAt: new Date().toISOString(),
      };

      // ── 截图封面 ──
      if (platform === '抖音' && parsed.linkType === 'douyin-modal' && parsed.postId) {
        await this.navigateToDouyinDetailForScreenshot(page, parsed.postId, opts.log).catch(() => {});
      }

      const cover = await this.captureScreenshot(page, platform);
      if (cover) {
        finalData.coverImageUrl = cover.coverImageUrl;
        finalData.coverThumbUrl = cover.coverThumbUrl;
      }

      this.logger.log(`[Scraper] ${platform} 抓取完成: ${Date.now() - t0}ms 赞${finalData.likes} 评${finalData.comments} 藏${finalData.favorites} 分享${finalData.shares}`);

      return finalData;
    } catch (err) {
      // 释放上下文：登录墙意味着 cookie 已过期，复用无意义
      await this.browserPool.releaseContext(platform, account.id).catch(() => {});
      throw err;
    } finally {
      // 关闭本次抓取打开的标签页
      if (page) {
        await page.close().catch(() => {});
      }
      // 兜底：关闭 context 中除首页外的所有残留标签
      try {
        const pages = ctx.pages();
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }

  // ── SSR 提取 ──

  private async extractSsrData(page: Page, postId: string | null): Promise<any> {
    return page.evaluate((hint: string | null) => {
      try {
        const root =
          (window as any).__INITIAL_STATE__ ||
          (window as any).__initialState__ ||
          null;
        if (!root || typeof root !== 'object') return null;

        const getNoteId = (note: any) =>
          String(note?.id || note?.note_id || note?.noteId || '').trim();

        const shapeNote = (note: any) => {
          if (!note || typeof note !== 'object') return null;
          const interact = note.interact_info || note.interactInfo || {};
          const user = note.user || {};
          const out: any = {
            noteId: getNoteId(note) || undefined,
            title: String(note.title || note.display_title || note.desc || '').trim(),
            authorName: String(user.nickname || '').trim() || undefined,
            authorId: String(user.user_id || user.userId || '').trim() || undefined,
            likes: Number(interact.liked_count ?? interact.likedCount ?? 0),
            comments: Number(interact.comment_count ?? interact.commentCount ?? 0),
            favorites: Number(interact.collected_count ?? interact.collectedCount ?? 0),
            shares: Number(interact.share_count ?? interact.shareCount ?? 0),
            time: Number(note.time ?? note.time_ms ?? 0),
          };
          return out;
        };

        // 1. noteDetailMap
        const map = root.note?.noteDetailMap;
        if (map && typeof map === 'object') {
          if (hint && map[hint]) {
            const raw = map[hint];
            const note = raw?.note || raw?.data?.note || raw;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-map-hint' };
          }
          const keys = Object.keys(map);
          if (!hint && keys.length === 1) {
            const raw = map[keys[0]];
            const note = raw?.note || raw?.data?.note || raw;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-map-only' };
          }
        }

        // 2. firstNoteId/currentNoteId
        const ptrId = root.note?.firstNoteId || root.note?.currentNoteId;
        if (ptrId && map?.[ptrId]) {
          const raw = map[ptrId];
          const note = raw?.note || raw?.data?.note || raw;
          if (hint && getNoteId(note) !== hint) return null;
          const s = shapeNote(note);
          if (s) return { ...s, _source: 'ssr-ptr' };
        }

        // 3. 旧版 noteData
        const noteData = root.noteData?.data?.noteData || root.noteData?.noteData;
        if (noteData) {
          const note = noteData.note || noteData;
          if (hint && getNoteId(note) !== hint) return null;
          const s = shapeNote(note);
          if (s) return { ...s, _source: 'ssr-noteData' };
        }

        return null;
      } catch {
        return null;
      }
    }, postId).catch(() => null);
  }

  // ── 数据提取 ──

  private extractData(
    platform: string,
    har: HarSnapshot,
    ssrData: any,
    parsed: UrlParseResult,
  ): Partial<ScrapedPostData> {
    if (platform === '小红书') {
      const result = this.xhsExtractor.extract(har, ssrData, parsed.postId);
      return {
        platform: '小红书',
        title: result.title || '',
        copywriting: result.copywriting || '',
        authorName: result.authorName || '',
        authorId: result.authorId || '',
        likes: result.likes,
        comments: result.comments,
        favorites: result.favorites,
        shares: result.shares,
        publishedAt: result.publishedAt || '',
      };
    }

    // 抖音
    const result = this.douyinExtractor.extract(har, parsed.postId);
    return {
      platform: '抖音',
      title: result.title || '',
      copywriting: result.copywriting || '',
      authorName: result.authorName || '',
      authorId: result.authorId || '',
      likes: result.likes,
      comments: result.comments,
      favorites: result.favorites,
      shares: result.shares,
      publishedAt: result.publishedAt || '',
    };
  }

  // ── 封面截图 ──

  /**
   * 抖音 modal 链接（user/...?modal_id=...）会显示用户主页，截图前切到标准详情页。
   * 优先尝试 /video/<awemeId>，若页面未落在 /video/ 或 /note/ 则 fallback 到 /note/<awemeId>。
   */
  private async navigateToDouyinDetailForScreenshot(
    page: Page,
    awemeId: string,
    log: (msg: string) => void,
  ): Promise<void> {
    const tryNavigate = async (url: string): Promise<boolean> => {
      try {
        log(`[截图准备] 尝试导航到 ${url}`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });
        // 等待页面初步渲染 + 关键图片开始加载
        await page.waitForTimeout(2000);
        // 等待封面/图片加载完成（最多再等 5s）
        await this.waitForImagesLoaded(page, 5000);
        // 额外稳定时间
        await page.waitForTimeout(800);
        const finalUrl = page.url();
        log(`[截图准备] 最终 URL: ${finalUrl}`);
        return /\/video\/|\/note\//.test(finalUrl);
      } catch (err: any) {
        log(`[截图准备] 导航失败: ${err?.message || err}`);
        return false;
      }
    };

    const videoUrl = `https://www.douyin.com/video/${awemeId}`;
    const noteUrl = `https://www.douyin.com/note/${awemeId}`;

    const ok = await tryNavigate(videoUrl);
    if (!ok) {
      await tryNavigate(noteUrl);
    }
  }

  /**
   * 等待页面中主要图片加载完成。
   * 策略：等待所有可见 img 标签的 complete 属性为 true，且自然高度 > 0。
   */
  private async waitForImagesLoaded(page: Page, timeoutMs: number = 5000): Promise<void> {
    try {
      await page.waitForFunction(
        () => {
          const images = Array.from(document.querySelectorAll('img'));
          const visibleImages = images.filter((img) => {
            const rect = img.getBoundingClientRect();
            return rect.width > 100 && rect.height > 100;
          });
          if (visibleImages.length === 0) return true;
          return visibleImages.every((img) => img.complete && img.naturalHeight > 0);
        },
        { timeout: timeoutMs },
      );
    } catch {
      // 超时不再等待，避免阻塞
    }
  }

  private async captureScreenshot(
    page: Page,
    platform: string,
  ): Promise<{ coverImageUrl: string; coverThumbUrl: string } | null> {
    try {
      // 1. 去浮层
      await this.dismissObstacles(page, platform).catch(() => {});

      // 2. 暂停视频（避免动态模糊）
      await this.pauseAllVideos(page);

      // 3. 截图
      const buf = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1440, height: 1080 },
        timeout: 10000,
      });

      if (!buf || buf.length < 5 * 1024) {
        this.logger.warn(`[Scraper] 截图 buffer 太小(${buf?.length || 0} bytes)，跳过`);
        return null;
      }

      // 4. 保存到 uploads/post-covers/
      const coversDir = this.resolveCoversDir();
      fs.mkdirSync(coversDir, { recursive: true });
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const filename = `${stamp}.png`;
      const filepath = path.join(coversDir, filename);
      fs.writeFileSync(filepath, buf);

      const url = `/uploads/post-covers/${filename}`;
      this.logger.log(`[Scraper] 截图封面写入: ${url}`);
      return { coverImageUrl: url, coverThumbUrl: url };
    } catch (err: any) {
      this.logger.warn(`[Scraper] 截图封面失败: ${err?.message || err}`);
      return null;
    }
  }

  // ── 去浮层 ──

  private async dismissObstacles(page: Page, platform: string): Promise<void> {
    const keywords = platform === '小红书'
      ? ['登录', '扫码', '立即登录', '手机号登录', '打开小红书App查看', '登录后推荐', '登录后评论']
      : ['登录', '扫码登录', '验证码登录', '登录后', '请登录', '我知道了', '新手引导', '滚动鼠标', '键盘上下键'];

    // 1) Escape
    await page.keyboard.press('Escape').catch(() => {});

    // 2) 点击关闭按钮
    const closeSelectors = [
      '.mask',
      '.close',
      '[class*="close"]',
      '[class*="cancel"]',
      'button:has-text("关闭")',
      'button:has-text("取消")',
      'button:has-text("以后再说")',
      'button:has-text("我知道了")',
    ];
    for (const sel of closeSelectors) {
      try {
        await page.locator(sel).first().click({ timeout: 300, force: true });
      } catch {
        /* ignore */
      }
    }

    // 3) 仅移除"明确是浮层"的节点（白名单类名），不再向上 bubble 父节点
    await page.evaluate((words) => {
      const hasWord = (el: Element) => words.some((w) => el.textContent?.includes(w));

      const OVERLAY_SELECTORS = [
        '[role="dialog"]',
        '.login-container',
        '.login-wrapper',
        '.modal',
        '.modal-wrapper',
        '.dialog-wrapper',
        '.qr-code-mask',
        '.mask',
        '.modal-mask',
        '.overlay',
        '[class*="LoginDialog"]',
        '[class*="loginContainer"]',
        '[class*="login-dialog"]',
        '[class*="backdrop"]',
      ];

      for (const sel of OVERLAY_SELECTORS) {
        document.querySelectorAll(sel).forEach((el) => {
          const isMask =
            sel.includes('mask') || sel.includes('backdrop') || sel.includes('overlay');
          if (isMask || hasWord(el)) {
            try { el.remove(); } catch { /* ignore */ }
          }
        });
      }

      // 解锁滚动
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
      document.body.style.position = 'static';
    }, keywords).catch(() => {});

    // 4) 抖音新手引导（全屏半透明层）
    if (platform === '抖音') {
      await page.evaluate(() => {
        document.querySelectorAll('div, section').forEach((el) => {
          const style = window.getComputedStyle(el);
          if (style.position !== 'fixed' && style.position !== 'absolute' && style.position !== 'sticky') return;
          const rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) {
            const text = el.textContent || '';
            if (/滚动[\s\S]*?鼠标|键盘[\s\S]*?上下键|点击屏幕|切换视频|更多推荐|我知道了/i.test(text)) {
              el.remove();
            }
          }
        });
      }).catch(() => {});
    }
  }

  // ── 登录墙检测 ──

  private isLoginWall(platform: string, bodyText: string, pageTitle: string): boolean {
    const text = String(bodyText || '');
    const title = String(pageTitle || '').trim();

    if (platform === '小红书') {
      // 登录墙判断：必须有"明确的登录墙信号"且"没有帖子内容信号"。
      // 注意：不加入 /点赞/、/评论/、/收藏/、/\d{2}-\d{2}/ 等过于宽松的模式——
      // 这些正则几乎必然命中任何正常页面，导致登录墙判断永远返回 false。
      const hasPostSignals =
        /共\s*[\d.,wkW万千]+\s*条评论/.test(text) ||
        /登录后评论\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text) ||
        /说点什么\.\.\.\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text);

      const genericTitle =
        title === '小红书 - 你的生活兴趣社区' ||
        title === '小红书' ||
        title.includes('你的生活兴趣社区');

      return (
        !hasPostSignals &&
        (text.includes('登录后推荐更懂你的笔记') ||
          text.includes('手机号登录') ||
          text.includes('扫码') ||
          text.includes('立即登录') ||
          text.includes('打开小红书App查看') ||
          genericTitle)
      );
    }

    return text.includes('登录后') || text.includes('扫码登录') || text.includes('验证码登录');
  }

  /**
   * 检测抖音作品是否已被删除/隐藏/下架。
   */
  private isDouyinPostDeleted(bodyText: string, pageTitle: string): boolean {
    const text = String(bodyText || '').trim();
    const title = String(pageTitle || '').trim();

    const DELETED_PHRASES = [
      '你要观看的图文不存在',
      '你要观看的视频不存在',
      '该内容已被删除',
      '视频不见了',
      '作品已删除',
      '该作品已下架',
      '内容审核中',
      '作品审核中',
      '该用户已被封禁',
      '账号已注销',
      '该账号已封禁',
    ];

    const hasPhrase = DELETED_PHRASES.some((p) => text.includes(p));

    const DELETED_TITLES = [
      '抖音',
      '抖音 - 记录美好生活',
    ];
    const isGenericTitle = DELETED_TITLES.includes(title);

    if (!hasPhrase) return false;

    const hasPostSignals =
      /点赞/.test(text) &&
      /评论/.test(text) &&
      /分享/.test(text);

    return !hasPostSignals || isGenericTitle;
  }

  /**
   * 检测最终 URL 是否为小红书失效笔记的 404 错误页。
   *
   * 小红书笔记被删除/隐藏/下架后，访问 /explore/<noteId> 会跳转到
   *   https://www.xiaohongshu.com/404?source=note&noteId=<id>&errorCode=<码>&...
   * 该页 <title> 为「小红书 - 你访问的页面不见了」，页面内无 "笔记不存在" 等文案，
   * 因此按 URL（/404 路径或 errorCode 参数）判定最可靠。
   */
  private isXiaohongshu404Url(url: string): boolean {
    if (!url) return false;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host !== 'xiaohongshu.com' && !host.endsWith('.xiaohongshu.com')) return false;
      if (u.pathname === '/404' || u.pathname.startsWith('/404/')) return true;
      if (u.searchParams.has('errorCode')) return true;
      return false;
    } catch {
      return /xiaohongshu\.com\/404\b/i.test(url);
    }
  }

  /**
   * 检测小红书笔记是否已被删除/隐藏/下架。
   */
  private isXiaohongshuNoteDeleted(bodyText: string, pageTitle: string): boolean {
    const text = String(bodyText || '').trim();
    const title = String(pageTitle || '').trim();

    const DELETED_PHRASES = [
      '笔记暂时无法浏览',
      '该笔记暂时无法浏览',
      '笔记不存在',
      '笔记已删除',
      '该内容已下架',
      '内容已下架',
      '内容不存在',
      '笔记已失效',
      '内容已删除',
      '你访问的页面不见了',
      '页面不见了',
    ];

    const hasPhrase = DELETED_PHRASES.some((p) => text.includes(p));

    const DELETED_TITLES = [
      '小红书 - 你的生活兴趣社区',
      '小红书',
      '小红书 - 你访问的页面不见了',
    ];
    const isGenericTitle = DELETED_TITLES.includes(title);

    if (!hasPhrase) return false;

    const hasPostSignals =
      /共\s*[\d.,wkW万千]+\s*条评论/.test(text) ||
      /登录后评论\s*[\d.,wkW万千]+/.test(text) ||
      /说点什么/.test(text) ||
      /点赞/.test(text);

    return !hasPostSignals || isGenericTitle;
  }

  private isMetricMissing(value: unknown): value is undefined | null {
    return value === undefined || value === null;
  }

  private mergeMetric(primary: unknown, fallback: number): number {
    if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
    if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) return fallback;
    return 0;
  }

  // ── body text 兜底提取 ──

  private extractFromBodyText(text: string): { likes: number; comments: number; favorites: number; shares: number } {
    const parse = (raw: string | undefined): number => {
      if (!raw) return 0;
      const m = raw.trim().match(/(\d+(?:\.\d+)?)\s*([wkW万千K]?)/i);
      if (!m) return Number(raw) || 0;
      let v = parseFloat(m[1]);
      const u = m[2].toLowerCase();
      if (u === 'w' || u === '万') v *= 10000;
      else if (u === 'k' || u === '千') v *= 1000;
      return Math.round(v);
    };

    const likesMatch = parse(text.match(/点赞\s*([\d.,wkW万千]+)/)?.[1]);
    const likesAltMatch = parse(text.match(/([\d.,wkW万千]+)\s*(?:点赞|赞)/)?.[1]);
    const likes = this.isMetricMissing(likesMatch) ? likesAltMatch : likesMatch;

    const commentsMatch = parse(text.match(/评论\s*([\d.,wkW万千]+)/)?.[1]);
    const commentsAltMatch = parse(text.match(/([\d.,wkW万千]+)\s*(?:评论)/)?.[1]);
    const totalComments = parse(text.match(/共\s*([\d.,wkW万千]+)\s*条评论/)?.[1]);
    const comments = this.isMetricMissing(totalComments) ? (this.isMetricMissing(commentsMatch) ? commentsAltMatch : commentsMatch) : totalComments;

    const favoritesMatch = parse(text.match(/收藏\s*([\d.,wkW万千]+)/)?.[1]);
    const favoritesAltMatch = parse(text.match(/([\d.,wkW万千]+)\s*(?:收藏)/)?.[1]);
    const favorites = this.isMetricMissing(favoritesMatch) ? favoritesAltMatch : favoritesMatch;

    const sharesMatch = parse(text.match(/分享\s*([\d.,wkW万千]+)/)?.[1]);
    const sharesAltMatch = parse(text.match(/([\d.,wkW万千]+)\s*(?:分享|转发)/)?.[1]);
    const shares = this.isMetricMissing(sharesMatch) ? sharesAltMatch : sharesMatch;

    return {
      likes,
      comments,
      favorites,
      shares,
    };
  }

  // ── 暂停视频 ──

  private async pauseAllVideos(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        document.querySelectorAll('video').forEach((v) => {
          try {
            if (!v.paused) v.pause();
            if (v.currentTime > 0.1) v.currentTime = 0;
          } catch {
            /* ignore */
          }
        });
      });
      await page.waitForTimeout(300);
    } catch {
      /* ignore */
    }
  }

  // ── 错误分类 ──

  private classifyError(err: any): { code: string; retryable: boolean; message: string } {
    const msg = err?.message || String(err);

    const TRANSIENT_PATTERNS = [
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ERR_NETWORK_CHANGED/i,
      /net::ERR_/i,
      /TimeoutError/i,
      /Navigation timeout/i,
      /抓取失败/,
    ];

    const LOGIN_WALL_PATTERNS = [/登录页/, /登录后/, /未登录/, /login_required/i];

    const PLAYWRIGHT_MISSING_PATTERNS = [
      /Executable doesn't exist/i,
      /playwright install/i,
      /chromium-\d+\s+not found/i,
      /browser is not supported/i,
    ];

    if (PLAYWRIGHT_MISSING_PATTERNS.some((re) => re.test(msg))) {
      return { code: 'playwright_missing', retryable: false, message: msg };
    }
    if (LOGIN_WALL_PATTERNS.some((re) => re.test(msg))) {
      return { code: 'login_required', retryable: false, message: msg };
    }
    if (TRANSIENT_PATTERNS.some((re) => re.test(msg))) {
      return { code: 'transient', retryable: true, message: msg };
    }
    return { code: 'unknown', retryable: false, message: msg };
  }

  // ── 目录解析 ──

  private resolveCoversDir(): string {
    const root = resolveRepoRoot(__dirname);
    const dir = path.join(root, 'uploads', 'post-covers');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
