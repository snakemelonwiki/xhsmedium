#!/usr/bin/env node
/**
 * test-scraper-v2.js — 独立测试新 Scraping V2 架构
 *
 * 用法：
 *   cd D:/pycharmProjects/xhsmedium_github
 *   node scripts/test-scraper-v2.js <url> [--timeout N] [--har]
 *
 * 示例：
 *   node scripts/test-scraper-v2.js "https://www.xiaohongshu.com/explore/6a09366300000000070240f7?xsec_token=ABzH4Nx4PUtX7Gx1-yTU-Tss9-rBKW9oTbKmqlmPOJftY=&xsec_source=pinghome" --timeout 20000 --har
 *
 * 输出：
 *   1. URL 分类结果
 *   2. HAR 条目列表（URL + 状态码 + content-type）
 *   3. 新版 XiaohongshuExtractor 提取结果
 *   4. 抖音 DouyinExtractor 提取结果（如果是抖音链接）
 *   5. 页面截图保存到 uploads/post-covers/test-screenshot-{timestamp}.png
 */

const path = require("path");
const fs = require("fs");

// 自动探测项目根目录
function resolveProjectRoot() {
  const candidates = [
    path.resolve(__dirname, '..'),
    process.env.PROJECT_ROOT || '',
    process.cwd(),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (fs.existsSync(path.join(c, '.playwright-profiles')) ||
        fs.existsSync(path.join(c, 'uploads'))) {
      return c;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
const PROFILE_ROOT = path.join(PROJECT_ROOT, '.playwright-profiles');
const COVERS_DIR = path.join(PROJECT_ROOT, 'uploads', 'post-covers');

// Playwright 浏览器路径
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32') {
  const dDrive = 'D:\\playwright-browsers';
  if (fs.existsSync(dDrive)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = dDrive;
  }
}

// 引入 Playwright
const { chromium } = require('playwright');

// ── URL 分类器（直接内联，不依赖编译后的 dist）──
function parseUrl(raw) {
  const url = String(raw || '').trim();
  const lower = url.toLowerCase();

  if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) {
    return parseXiaohongshu(url);
  }
  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
    return parseDouyin(url);
  }
  return { platform: null, linkType: 'unknown', normalizedUrl: url, postId: null, params: {} };
}

function parseXiaohongshu(url) {
  const lower = url.toLowerCase();
  if (lower.includes('xhslink.com')) {
    const code = url.match(/xhslink\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return { platform: 'xiaohongshu', linkType: 'xhs-short', normalizedUrl: url, postId: code || null, params: code ? { shortCode: code } : {} };
  }
  const exploreMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/i);
  if (exploreMatch) {
    const params = {};
    const xsecToken = url.match(/[?&]xsec_token=([^&]+)/i)?.[1];
    const xsecSource = url.match(/[?&]xsec_source=([^&]+)/i)?.[1];
    if (xsecToken) params.xsecToken = xsecToken;
    if (xsecSource) params.xsecSource = xsecSource;
    return { platform: 'xiaohongshu', linkType: 'xhs-standard', normalizedUrl: url, postId: exploreMatch[1], params };
  }
  const legacyMatch = url.match(/\/discovery\/item\/([a-zA-Z0-9]+)/i);
  if (legacyMatch) {
    return { platform: 'xiaohongshu', linkType: 'xhs-standard', normalizedUrl: url, postId: legacyMatch[1], params: {} };
  }
  return { platform: 'xiaohongshu', linkType: 'xhs-unknown', normalizedUrl: url, postId: null, params: {} };
}

function parseDouyin(url) {
  const lower = url.toLowerCase();
  if (lower.includes('v.douyin.com')) {
    const code = url.match(/v\.douyin\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return { platform: 'douyin', linkType: 'douyin-short', normalizedUrl: url, postId: code || null, params: code ? { shortCode: code } : {} };
  }
  const videoMatch = url.match(/\/video\/(\d+)/i);
  if (videoMatch) return { platform: 'douyin', linkType: 'douyin-video', normalizedUrl: url, postId: videoMatch[1], params: {} };
  const noteMatch = url.match(/\/note\/(\d+)/i);
  if (noteMatch) return { platform: 'douyin', linkType: 'douyin-note', normalizedUrl: url, postId: noteMatch[1], params: {} };
  const modalMatch = url.match(/[?&]modal_id=(\d+)/i);
  if (modalMatch) return { platform: 'douyin', linkType: 'douyin-modal', normalizedUrl: url, postId: modalMatch[1], params: {} };
  if (lower.includes('iesdouyin.com')) return { platform: 'douyin', linkType: 'douyin-short', normalizedUrl: url, postId: null, params: {} };
  return { platform: 'douyin', linkType: 'douyin-unknown', normalizedUrl: url, postId: null, params: {} };
}

// ── HAR 监听器（简化版）──
class HarListener {
  constructor(page, options = {}) {
    this.page = page;
    this.entries = [];
    this.options = options;
  }
  start() {
    this.page.on('response', async (response) => {
      try {
        const url = response.url();
        const request = response.request();
        const resourceType = request.resourceType();
        const excludeTypes = this.options.excludeResourceTypes || new Set(['image', 'stylesheet', 'font', 'media', 'websocket', 'eventsource']);
        if (excludeTypes.has(resourceType)) return;
        if (this.options.urlFilter?.length) {
          const matches = this.options.urlFilter.some((re) => re.test(url));
          if (!matches) return;
        }
        const max = this.options.maxEntries || 200;
        if (this.entries.length >= max) return;

        const status = response.status();
        let contentType = '';
        try { contentType = (response.headers()['content-type'] || '').toLowerCase(); } catch { /* ignore */ }

        const entry = { url, method: request.method(), status, contentType, timestamp: Date.now(), jsonBody: null, textBody: null };

        if (status >= 200 && status < 300 && contentType.includes('application/json')) {
          try { entry.jsonBody = await response.json(); } catch {
            try { entry.textBody = await response.text(); } catch { /* ignore */ }
          }
        } else if (status >= 200 && status < 300 && contentType.includes('text/html')) {
          try { entry.textBody = await response.text(); } catch { /* ignore */ }
        }
        this.entries.push(entry);
      } catch { /* ignore */ }
    });
  }
  stop() { return { entries: this.entries, startedAt: 0, finishedAt: Date.now() }; }
  getCurrentEntries() { return this.entries; }
}

// ── 小红书 Extractor（简化版，直接内联）──
function extractXiaohongshu(har, noteIdHint) {
  const result = {};

  // Feed API
  const feedEntries = har.entries.filter((e) => /\/api\/sns\/web\/v[12]\/feed/i.test(e.url) && e.jsonBody);
  for (const entry of feedEntries) {
    const data = entry.jsonBody;
    const items = data?.data?.items || data?.items;
    if (!Array.isArray(items) || !items.length) continue;
    const card = items[0]?.note_card || items[0]?.noteCard;
    if (!card) continue;
    const info = card.interact_info || card.interactInfo || {};
    const user = card.user || {};
    return {
      title: String(card.title || card.desc || '').trim(),
      authorName: String(user.nickname || '').trim() || undefined,
      authorId: String(user.user_id || user.userId || '').trim() || undefined,
      likes: parseCount(info.liked_count || info.likedCount),
      comments: parseCount(info.comment_count || info.commentCount),
      favorites: parseCount(info.collected_count || info.collectedCount),
      shares: parseCount(info.share_count || info.shareShare),
      publishedAt: formatTimestamp(card.time || card.time_ms || card.timestamp),
      source: 'feed-api',
    };
  }

  // Note Detail API
  const noteEntries = har.entries.filter((e) => /\/api\/sns\/web\/v\d+\/note\b/i.test(e.url) && e.jsonBody);
  for (const entry of noteEntries) {
    const data = entry.jsonBody;
    const noteData = data?.data?.noteData || data?.noteData;
    if (!noteData) continue;
    const note = noteData.note || noteData;
    const interact = note?.interact_info || note?.interactInfo || {};
    const user = note?.user || {};
    return {
      title: String(note.title || note.display_title || note.desc || '').trim(),
      authorName: String(user.nickname || '').trim() || undefined,
      authorId: String(user.user_id || user.userId || '').trim() || undefined,
      likes: parseCount(interact.liked_count || interact.likedCount),
      comments: parseCount(interact.comment_count || interact.commentCount),
      favorites: parseCount(interact.collected_count || interact.collectedCount),
      shares: parseCount(interact.share_count || interact.shareShare),
      publishedAt: formatTimestamp(note.time || note.time_ms || note.timestamp),
      source: 'note-api',
    };
  }

  // SSR __INITIAL_STATE__
  const htmlEntries = har.entries.filter((e) => e.contentType.includes('text/html') && e.textBody);
  for (const entry of htmlEntries) {
    const html = entry.textBody || '';
    const initialState = parseInitialState(html);
    if (!initialState) continue;

    const map = initialState.note?.noteDetailMap;
    if (map && typeof map === 'object') {
      const notes = Object.values(map);
      for (const item of notes) {
        const note = item?.note || item?.data?.note || item;
        if (!note || typeof note !== 'object') continue;
        const interact = note.interact_info || note.interactInfo || {};
        const user = note.user || {};
        return {
          title: String(note.title || note.display_title || note.desc || '').trim(),
          authorName: String(user.nickname || '').trim() || undefined,
          authorId: String(user.user_id || user.userId || '').trim() || undefined,
          likes: parseCount(interact.liked_count || interact.likedCount),
          comments: parseCount(interact.comment_count || interact.commentCount),
          favorites: parseCount(interact.collected_count || interact.collectedCount),
          shares: parseCount(interact.share_count || interact.shareShare),
          publishedAt: formatTimestamp(note.time || note.time_ms || note.timestamp),
          source: 'ssr-initial-state',
        };
      }
    }

    const noteData = initialState.noteData?.data?.noteData || initialState.noteData?.noteData;
    if (noteData) {
      const note = noteData.note || noteData;
      const interact = note?.interact_info || note?.interactInfo || {};
      const user = note?.user || {};
      return {
        title: String(note.title || note.display_title || note.desc || '').trim(),
        authorName: String(user.nickname || '').trim() || undefined,
        authorId: String(user.user_id || user.userId || '').trim() || undefined,
        likes: parseCount(interact.liked_count || interact.likedCount),
        comments: parseCount(interact.comment_count || interact.commentCount),
        favorites: parseCount(interact.collected_count || interact.collectedCount),
        shares: parseCount(interact.share_count || interact.shareShare),
        publishedAt: formatTimestamp(note.time || note.time_ms || note.timestamp),
        source: 'ssr-noteData',
      };
    }
  }

  return { source: 'none', note: '未从 HAR 中提取到数据' };
}

function parseInitialState(html) {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});?\s*(?:<\/script>|\n|$)/s);
  if (!match?.[1]) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function parseCount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim().toLowerCase().replace(/,/g, '');
  if (!text) return 0;
  const match = text.match(/(\d+(?:\.\d+)?)\s*([wk万千k]?)/);
  if (!match) return Number(text) || 0;
  const amount = Number(match[1]);
  const unit = match[2].trim();
  if (Number.isNaN(amount)) return 0;
  if (unit === 'w' || unit === '万') return Math.round(amount * 10000);
  if (unit === 'k' || unit === '千') return Math.round(amount * 1000);
  return Math.round(amount);
}

function formatTimestamp(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 100000000000 ? n : n * 1000;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 主函数 ──
async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  if (!url || url.startsWith('--')) {
    console.error('用法: node scripts/test-scraper-v2.js <url> [--timeout N] [--har]');
    process.exit(1);
  }

  const timeout = Number(args.find((_, i) => args[i - 1] === '--timeout') || 20000);
  const dumpHar = args.includes('--har');

  console.log(`\n========== Scraping V2 测试 ==========`);
  console.log(`URL: ${url}`);
  console.log(`Timeout: ${timeout}ms`);
  console.log(`Dump HAR: ${dumpHar}`);
  console.log(`Profile Root: ${PROFILE_ROOT}`);
  console.log(`=======================================\n`);

  // 1. URL 分类
  const parsed = parseUrl(url);
  console.log('【URL 分类结果】');
  console.log(JSON.stringify(parsed, null, 2));
  console.log();

  if (!parsed.platform) {
    console.error('不支持的平台');
    process.exit(1);
  }

  const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';

  // 2. 启动浏览器
  const profileDir = path.join(PROFILE_ROOT, platform === '抖音' ? 'douyin' : 'xiaohongshu');
  fs.mkdirSync(profileDir, { recursive: true });

  // 清理锁文件
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(profileDir, name), { force: true, recursive: true }); } catch { /* ignore */ }
  }

  console.log(`【启动浏览器】profileDir=${profileDir}`);
  const isHeadless = platform !== '小红书';
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: isHeadless,
    viewport: { width: 1440, height: 1100 },
    args: [
      ...(isHeadless ? ['--disable-remote-fonts'] : []),
      ...(platform === '抖音' ? ['--disable-blink-features=AutomationControlled'] : []),
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
    ],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  let page;
  try {
    page = await ctx.newPage();

    // 资源拦截（仅小红书）
    if (platform !== '抖音') {
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // 挂载 HAR 监听器（必须在 page.goto 之前）
    const harListener = new HarListener(page, {
      urlFilter: [
        // 先不限制，收集所有请求看看
      ],
      maxEntries: 500,
    });
    harListener.start();

    // 导航（先不拦截资源，测试 response 事件是否正常）
    console.log(`【页面导航】${url}`);
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    console.log(`页面加载完成: ${Date.now() - t0}ms\n`);

    // 去浮层
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('.mask, .modal-mask, .overlay').forEach((el) => el.remove());
      document.body.style.overflow = 'auto';
    }).catch(() => {});

    // 停止 HAR
    const har = harListener.stop();
    console.log(`【HAR 收集结果】共 ${har.entries.length} 条响应`);
    for (const entry of har.entries) {
      const hasJson = entry.jsonBody ? '✓ JSON' : '';
      const hasText = entry.textBody ? `✓ Text(${entry.textBody.length} chars)` : '';
      console.log(`  [${entry.status}] ${entry.method} ${entry.url.slice(0, 120)} ${hasJson} ${hasText}`);
    }
    console.log();

    if (dumpHar) {
      const harPath = path.join(PROJECT_ROOT, `test-har-${Date.now()}.json`);
      fs.writeFileSync(harPath, JSON.stringify(har.entries, null, 2));
      console.log(`HAR 已保存到: ${harPath}\n`);
    }

    // 调试：分析 HAR 中的 HTML 条目和 __INITIAL_STATE__
    console.log('\n【HAR HTML 分析】');
    const htmlEntries2 = har.entries.filter((e) => e.textBody);
    for (const entry of htmlEntries2) {
      if (entry.url.includes('/explore/')) {
        console.log(`  HTML URL: ${entry.url.slice(0, 120)}`);
        console.log(`  Content-Type: ${entry.contentType}`);
        console.log(`  Body length: ${entry.textBody.length}`);
        const hasInitialState = entry.textBody.includes('__INITIAL_STATE__');
        console.log(`  Contains __INITIAL_STATE__: ${hasInitialState}`);
        if (hasInitialState) {
          const match = entry.textBody.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});?\s*(?:<\/script>|\n|$)/s);
          if (match) {
            console.log(`  __INITIAL_STATE__ 长度: ${match[1].length}`);
            // 检查是否包含 noteDetailMap
            const hasNoteDetailMap = match[1].includes('noteDetailMap');
            console.log(`  Contains noteDetailMap: ${hasNoteDetailMap}`);
            if (hasNoteDetailMap) {
              try {
                const initialState = JSON.parse(match[1]);
                const map = initialState.note?.noteDetailMap;
                if (map) {
                  console.log(`  noteDetailMap keys: ${Object.keys(map).slice(0, 5).join(', ')}`);
                }
              } catch (e) {
                console.log(`  JSON parse error: ${e.message}`);
              }
            }
          }
        }
        // 也检查是否包含登录相关文案
        const loginKeywords = ['登录', '扫码', '立即登录', '手机号登录'];
        const foundKeywords = loginKeywords.filter((kw) => entry.textBody.includes(kw));
        console.log(`  登录相关文案: ${foundKeywords.join(', ') || '无'}`);
      }
    }
    console.log();

    // 调试：检查是否有 login/qrcode/create 请求（确认未登录）
    const loginRequests = har.entries.filter((e) => e.url.includes('login') || e.url.includes('qrcode'));
    if (loginRequests.length > 0) {
      console.log('【登录检测】发现登录相关请求，说明未登录：');
      for (const entry of loginRequests) {
        console.log(`  ${entry.method} ${entry.url.slice(0, 120)}`);
      }
      console.log('  提示：小红书笔记详情需要登录态，请先完成登录。\n');
    }

    // 数据提取
    if (platform === '小红书') {
      const extracted = extractXiaohongshu(har, parsed.postId);
      console.log('【小红书数据提取结果】');
      console.log(JSON.stringify(extracted, null, 2));
    } else {
      console.log('【抖音数据提取】当前测试脚本未实现抖音提取器，请用新版架构测试。');
    }
    console.log();

    // 截图
    const screenshotPath = path.join(COVERS_DIR, `test-screenshot-${Date.now()}.png`);
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1440, height: 1080 } });
    console.log(`【截图已保存】${screenshotPath}\n`);

    // 页面标题
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log(`【页面标题】${title}`);
    console.log(`【页面正文前 200 字】${bodyText.slice(0, 200)}...`);

  } finally {
    await ctx.close();
    console.log('\n浏览器已关闭');
  }
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
