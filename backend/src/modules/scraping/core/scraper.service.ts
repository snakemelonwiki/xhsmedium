import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserPoolService } from './browser-pool.service';
import { HarListener } from './har-listener';
import { XiaohongshuExtractor } from './extractors/xiaohongshu.extractor';
import { DouyinExtractor } from './extractors/douyin.extractor';
import { parseUrl } from './url-parser';
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
 * 统一抓取服务
 *
 * 核心职责：
 *   1. URL 分类（parseUrl）
 *   2. 获取浏览器上下文（BrowserPoolService）
 *   3. 挂载 HAR 监听器
 *   4. 页面导航 + 去浮层
 *   5. 数据提取（XiaohongshuExtractor / DouyinExtractor）
 *   6. 截图封面
 *   7. 登录墙检测
 *   8. 错误分类与重试
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly xhsExtractor = new XiaohongshuExtractor();
  private readonly douyinExtractor = new DouyinExtractor();

  constructor(private readonly browserPool: BrowserPoolService) {}

  /**
   * 主入口：抓取单个 URL
   */
  async scrape(url: string, opts: ScrapingOptions = {}): Promise<ScrapingResult> {
    const log = opts.log || ((msg: string) => this.logger.log(msg));
    const retry = Math.max(0, Number(opts.retry ?? 3));
    const timeout = Math.max(1000, Number(opts.timeout ?? 20000));

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

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
        log(`重试 ${attempt}/${retry}，等待 ${backoff}ms 后重试`);
        await sleep(backoff);
      }

      try {
        log(`第 ${attempt + 1} 次抓取 ${platform}: ${parsed.normalizedUrl}`);
        const data = await this.doScrape(parsed, { timeout, log });
        log(`抓取结果 ${platform}: title=${(data.title || '').slice(0, 60)}, publishedAt=${data.publishedAt || ''}`);
        return { ok: true, data };
      } catch (err: any) {
        lastErr = err;
        const cls = this.classifyError(err);
        log(`第 ${attempt + 1} 次失败 [${cls.code}]: ${cls.message}`);
        if (!cls.retryable || attempt === retry) {
          return {
            ok: false,
            error: { ...cls, platform },
          };
        }
      }
    }

    return {
      ok: false,
      error: {
        code: 'exhausted',
        retryable: false,
        message: lastErr?.message || '重试用尽',
        platform,
      },
    };
  }

  /**
   * 核心抓取逻辑（单次，无重试）
   */
  private async doScrape(
    parsed: UrlParseResult,
    opts: { timeout: number; log: (msg: string) => void },
  ): Promise<ScrapedPostData> {
    const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
    const ctx = await this.browserPool.acquireContext(platform);
    let page: Page | null = null;
    const t0 = Date.now();

    try {
      page = await ctx.newPage();

      // ── 资源拦截：仅抖音启用（小红书需要完整 JS/CSS 执行以触发 API 请求） ──
      if (platform === '抖音') {
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (BLOCKED_RESOURCE_TYPES.has(type)) {
            route.abort();
          } else {
            route.continue();
          }
        });
      }

      // ── 挂载 HAR 监听器 ──
      const harListener = new HarListener(page, {
        // 小红书：关注 feed API、note API
        // 抖音：关注 RENDER_DATA、RSC flight、aweme/detail API
        urlFilter: [
          /\/api\/sns\/web\/v[12]\/feed/i,
          /\/api\/sns\/web\/v\d+\/note\b/i,
          /\/aweme\/v1\/web\/aweme\/detail\//i,
          /\/aweme\/v1\/web\/aweme\/related\//i,
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
      try {
        const finalUrl = page.url();
        if (finalUrl && finalUrl !== parsed.normalizedUrl) {
          parsed = this.refreshParsedFromFinalUrl(parsed, finalUrl);
          opts.log(`重定向后 URL: ${finalUrl}, postId=${parsed.postId || 'null'}`);
        }
      } catch { /* ignore */ }

      // ── 登录墙检测：先取原始 body 文本，避免 dismissObstacles 误删主容器后取不到帖子信号 ──
      const pageTitle = await page.title().catch(() => '');
      const bodyTextRaw = await page.locator('body').innerText().catch(() => '');

      // ── 去浮层 ──
      await this.dismissObstacles(page, platform).catch(() => {});

      if (this.isLoginWall(platform, bodyTextRaw, pageTitle)) {
        // 登录墙不释放 context：用户登录态可能完好，只是当前页被弹窗拦截
        throw new Error(
          `当前打开的是${platform}登录页/登录弹窗，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`,
        );
      }

      // 去浮层后再取一份 bodyText 用于兜底指标提取
      const bodyText = await page.locator('body').innerText().catch(() => bodyTextRaw);

      // ── 读取 SSR 数据 ──
      // Vue 3 reactive 对象不能整体 JSON.stringify（每次读属性会生成新 Proxy，
      // WeakSet 去重失效，必报 "circular structure"）。所以必须在浏览器里
      // 沿已知路径直接读 *标量* 字段返回 Node 端。
      const ssrExtracted = await page.evaluate((hint: string | null) => {
        try {
          const root =
            (window as any).__INITIAL_STATE__ ||
            (window as any).__initialState__ ||
            null;
          if (!root || typeof root !== 'object') return null;

          const shapeNote = (note: any) => {
            if (!note || typeof note !== 'object') return null;
            const interact = note.interact_info || note.interactInfo || {};
            const user = note.user || {};
            const out: any = {
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

          // 1. noteDetailMap：用 hint 精确匹配
          const map = root.note?.noteDetailMap;
          if (map && typeof map === 'object') {
            if (hint && map[hint]) {
              const raw = map[hint];
              const note = raw?.note || raw?.data?.note || raw;
              const s = shapeNote(note);
              if (s) return { ...s, _source: 'ssr-map-hint' };
            }
            // 没 hint 或没命中：只有一条时才取（避免错笔记）
            const keys = Object.keys(map);
            if (keys.length === 1) {
              const raw = map[keys[0]];
              const note = raw?.note || raw?.data?.note || raw;
              const s = shapeNote(note);
              if (s) return { ...s, _source: 'ssr-map-only' };
            }
          }

          // 2. firstNoteId/currentNoteId 指针
          const ptrId = root.note?.firstNoteId || root.note?.currentNoteId;
          if (ptrId && map?.[ptrId]) {
            const raw = map[ptrId];
            const note = raw?.note || raw?.data?.note || raw;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-ptr' };
          }

          // 3. 旧版 noteData 路径
          const noteData = root.noteData?.data?.noteData || root.noteData?.noteData;
          if (noteData) {
            const note = noteData.note || noteData;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-noteData' };
          }

          return null;
        } catch {
          return null;
        }
      }, parsed.postId).catch(() => null);

      opts.log(`SSR ${ssrExtracted ? `OK (${(ssrExtracted as any)._source}): 赞${(ssrExtracted as any).likes} 评${(ssrExtracted as any).comments}` : '空'}`);

      // ── 停止 HAR 收集 ──
      const har = harListener.stop();

      // ── 数据提取 ──
      const data = this.extractData(platform, har, ssrExtracted, parsed);

      // 降级到 DOM 文本分析：按字段独立降级，如果某个指标为 0 尝试从 bodyText 获取
      const fallback = this.extractFromBodyText(bodyText);
      if (data.likes === 0 && fallback.likes > 0) data.likes = fallback.likes;
      if (data.comments === 0 && fallback.comments > 0) data.comments = fallback.comments;
      if (data.favorites === 0 && fallback.favorites > 0) data.favorites = fallback.favorites;
      if (data.shares === 0 && fallback.shares > 0) data.shares = fallback.shares;

      // ── 截图封面 ──
      const cover = await this.captureScreenshot(page, platform);
      if (cover) {
        data.coverImageUrl = cover.coverImageUrl;
        data.coverThumbUrl = cover.coverThumbUrl;
      }

      data.metricsUpdatedAt = new Date().toISOString();
      this.logger.log(`[Scraper] ${platform} 抓取完成: ${Date.now() - t0}ms 赞${data.likes} 评${data.comments} 藏${data.favorites} 分享${data.shares}`);

      return data;
    } catch (err) {
      // 非登录墙错误：释放上下文（下次重新冷启动）
      if (!String(err).includes('登录页')) {
        await this.browserPool.releaseContext(platform);
      }
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

  // ── 数据提取 ──

  /**
   * 重定向 / 短链跳转后，从浏览器当前 URL 重新解析 postId 与 normalizedUrl，
   * 让 extractor 能用上正确的 noteId 做精确匹配。
   */
  private refreshParsedFromFinalUrl(prev: UrlParseResult, finalUrl: string): UrlParseResult {
    try {
      const reparsed = parseUrl(finalUrl);
      // 平台一致才接受重写；否则保留原结果（防御性）
      if (reparsed.platform && reparsed.platform === prev.platform) {
        return {
          ...prev,
          ...reparsed,
          // 合并参数（保留原 xsec_token 等）
          params: { ...prev.params, ...reparsed.params },
        };
      }
    } catch { /* ignore */ }
    return prev;
  }

  private extractData(
    platform: string,
    har: HarSnapshot,
    ssrData: any,
    parsed: UrlParseResult,
  ): ScrapedPostData {
    if (platform === '小红书') {
      const result = this.xhsExtractor.extract(har, ssrData, parsed.postId);
      return {
        platform: '小红书',
        title: result.title || '',
        copywriting: result.copywriting || '',
        authorName: result.authorName || '',
        authorId: result.authorId || '',
        likes: result.likes || 0,
        comments: result.comments || 0,
        favorites: result.favorites || 0,
        shares: result.shares || 0,
        publishedAt: result.publishedAt || '',
        metricsUpdatedAt: new Date().toISOString(),
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
      likes: result.likes || 0,
      comments: result.comments || 0,
      favorites: result.favorites || 0,
      shares: result.shares || 0,
      publishedAt: result.publishedAt || '',
      metricsUpdatedAt: new Date().toISOString(),
    };
  }

  // ── 封面截图 ──

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
    //    旧逻辑会 parent.parent → remove，常把笔记主容器一起删掉，导致登录墙误判。
    await page.evaluate((words) => {
      const hasWord = (el: Element) => words.some((w) => el.textContent?.includes(w));

      // 已知的浮层容器选择器（小红书 / 抖音）
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
          // 只移除"包含登录/扫码关键词"或"明确是 mask"的元素，避免误删
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
      const hasPostSignals =
        /共\s*[\d.,wkW万千]+\s*条评论/.test(text) ||
        /登录后评论\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text) ||
        /说点什么\.\.\.\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text) ||
        /点赞/.test(text) ||
        /评论/.test(text) ||
        /收藏/.test(text) ||
        /\d{2}-\d{2}/.test(text);

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

    const likes = parse(text.match(/点赞\s*([\d.,wkW万千]+)/)?.[1])
              || parse(text.match(/([\d.,wkW万千]+)\s*(?:点赞|赞)/)?.[1]);
    const comments = parse(text.match(/评论\s*([\d.,wkW万千]+)/)?.[1])
              || parse(text.match(/([\d.,wkW万千]+)\s*(?:评论)/)?.[1]);
    const favorites = parse(text.match(/收藏\s*([\d.,wkW万千]+)/)?.[1])
              || parse(text.match(/([\d.,wkW万千]+)\s*(?:收藏)/)?.[1]);
    const shares = parse(text.match(/分享\s*([\d.,wkW万千]+)/)?.[1])
              || parse(text.match(/([\d.,wkW万千]+)\s*(?:分享|转发)/)?.[1]);
    const totalComments = parse(text.match(/共\s*([\d.,wkW万千]+)\s*条评论/)?.[1]);

    return {
      likes,
      comments: totalComments || comments,
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
      /waitForTimeout/i,
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
    const candidates = [
      path.resolve(__dirname, '../../../../..'), // backend/src/modules/scraping/core/ → 项目根目录
      path.resolve(__dirname, '../../../../../..'), // backend/dist/ → 项目根目录
      process.env.PROJECT_ROOT || '',
      process.cwd(),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const dir = path.join(candidate, 'uploads', 'post-covers');
      try {
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      } catch {
        /* try next */
      }
    }

    return path.join(process.cwd(), 'uploads', 'post-covers');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
