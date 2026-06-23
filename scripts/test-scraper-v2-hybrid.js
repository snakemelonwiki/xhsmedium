#!/usr/bin/env node
/**
 * test-scraper-v2-hybrid.js — 测试新版 Hybrid 架构（HAR + page.evaluate SSR）
 *
 * 用法：
 *   cd D:/pycharmProjects/xhsmedium_github
 *   node scripts/test-scraper-v2-hybrid.js <url> [--timeout N] [--har]
 *
 * 2026-06-21: 新版架构关键修正 — 小红书 SSR 数据通过 page.evaluate()
 * 读取 window.__INITIAL_STATE__，而非 HAR 正则解析 HTML。
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

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32') {
  const dDrive = 'D:\\playwright-browsers';
  if (fs.existsSync(dDrive)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = dDrive;
  }
}

const { chromium } = require('playwright');

// ── URL 分类器 ──
function parseUrl(raw) {
  const url = String(raw || '').trim();
  const lower = url.toLowerCase();
  if (lower.includes('xiaohongshu.com') || lower.includes('xhslink.com')) {
    if (lower.includes('xhslink.com')) {
      const code = url.match(/xhslink\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
      return { platform: 'xiaohongshu', linkType: 'xhs-short', normalizedUrl: url, postId: code || null, params: code ? { shortCode: code } : {} };
    }
    const exploreMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/i);
    if (exploreMatch) {
      const params = {};
      const xsecToken = url.match(/[?&]xsec_token=([^&]+)/i)?.[1];
      if (xsecToken) params.xsecToken = xsecToken;
      return { platform: 'xiaohongshu', linkType: 'xhs-standard', normalizedUrl: url, postId: exploreMatch[1], params };
    }
    return { platform: 'xiaohongshu', linkType: 'xhs-unknown', normalizedUrl: url, postId: null, params: {} };
  }
  if (lower.includes('douyin.com') || lower.includes('iesdouyin.com')) {
    const videoMatch = url.match(/\/video\/(\d+)/i);
    if (videoMatch) return { platform: 'douyin', linkType: 'douyin-video', normalizedUrl: url, postId: videoMatch[1], params: {} };
    const noteMatch = url.match(/\/note\/(\d+)/i);
    if (noteMatch) return { platform: 'douyin', linkType: 'douyin-note', normalizedUrl: url, postId: noteMatch[1], params: {} };
    return { platform: 'douyin', linkType: 'douyin-unknown', normalizedUrl: url, postId: null, params: {} };
  }
  return { platform: null, linkType: 'unknown', normalizedUrl: url, postId: null, params: {} };
}

// ── 指标解析 ──
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

function parseTimestamp(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 100000000000 ? n : n * 1000;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── HAR 监听器 ──
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
}

// ── 新版小红书 Extractor（Hybrid: HAR + SSR evaluate）──
function extractXiaohongshu(har, ssrData, noteIdHint) {
  // 优先级 1: SSR __INITIAL_STATE__（page.evaluate 结果）
  if (ssrData && typeof ssrData === 'object') {
    const map = ssrData.note?.noteDetailMap;
    if (map && typeof map === 'object') {
      const notes = Object.values(map);
      for (const raw of notes) {
        const note = raw?.note || raw?.data?.note || raw;
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
          shares: parseCount(interact.share_count || interact.shareCount),
          publishedAt: parseTimestamp(note.time || note.time_ms || note.timestamp),
          source: 'ssr-initial-state',
        };
      }
    }
    // noteData fallback
    const noteData = ssrData.noteData?.data?.noteData || ssrData.noteData?.noteData;
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
        shares: parseCount(interact.share_count || interact.shareCount),
        publishedAt: parseTimestamp(note.time || note.time_ms || note.timestamp),
        source: 'ssr-noteData',
      };
    }
  }

  // 优先级 2: Feed API（HAR）
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
      shares: parseCount(info.share_count || info.shareCount),
      publishedAt: parseTimestamp(card.time || card.time_ms),
      source: 'feed-api',
    };
  }

  // 优先级 3: Note Detail API（HAR）
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
      shares: parseCount(interact.share_count || interact.shareCount),
      publishedAt: parseTimestamp(note.time || note.time_ms),
      source: 'note-api',
    };
  }

  return { source: 'none', note: '未提取到数据' };
}

// ── 主函数 ──
async function main() {
  const args = process.argv.slice(2);
  const url = args[0];
  if (!url || url.startsWith('--')) {
    console.error('用法: node scripts/test-scraper-v2-hybrid.js <url> [--timeout N] [--har]');
    process.exit(1);
  }

  const timeout = Number(args.find((_, i) => args[i - 1] === '--timeout') || 20000);
  const dumpHar = args.includes('--har');

  console.log(`\n========== Scraping V2 Hybrid 测试 ==========`);
  console.log(`URL: ${url}`);
  console.log(`Timeout: ${timeout}ms`);
  console.log(`=============================================\n`);

  const parsed = parseUrl(url);
  console.log('【URL 分类】', JSON.stringify(parsed, null, 2), '\n');
  if (!parsed.platform) { console.error('不支持的平台'); process.exit(1); }

  const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
  const profileDir = path.join(PROFILE_ROOT, platform === '抖音' ? 'douyin' : 'xiaohongshu');
  fs.mkdirSync(profileDir, { recursive: true });
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

    // 不拦截资源（先测试 response 事件是否正常）
    const harListener = new HarListener(page, {
      urlFilter: [
        /\/api\/sns\/web\/v[12]\/feed/i,
        /\/api\/sns\/web\/v\d+\/note\b/i,
        /\/aweme\/v1\/web\/aweme\/detail\//i,
        /RENDER_DATA/i,
      ],
      maxEntries: 200,
    });
    harListener.start();

    console.log(`【页面导航】${url}`);
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    console.log(`页面加载完成: ${Date.now() - t0}ms`);
    console.log(`页面标题: ${await page.title().catch(() => '')}`);
    console.log();

    // ── 关键：用 page.evaluate 读取 SSR 数据（在 evaluate 内部做提取，避免序列化超大对象）──
    console.log('【读取 SSR 数据】page.evaluate() 内部提取笔记数据');
    const ssrData = await page.evaluate((targetNoteId) => {
      try {
        const root = window.__INITIAL_STATE__ || window.__initialState__ || null;
        if (!root || typeof root !== 'object') return null;

        // 从 noteDetailMap 提取
        const map = root.note?.noteDetailMap;
        if (map && typeof map === 'object') {
          const notes = Object.values(map);
          for (const raw of notes) {
            const note = raw?.note || raw?.data?.note || raw;
            if (!note || typeof note !== 'object') continue;
            const interact = note.interact_info || note.interactInfo || {};
            const user = note.user || {};
            return {
              title: String(note.title || note.display_title || note.desc || '').trim(),
              authorName: String(user.nickname || '').trim() || undefined,
              authorId: String(user.user_id || user.userId || '').trim() || undefined,
              likes: Number(interact.liked_count || interact.likedCount || 0),
              comments: Number(interact.comment_count || interact.commentCount || 0),
              favorites: Number(interact.collected_count || interact.collectedCount || 0),
              shares: Number(interact.share_count || interact.shareCount || 0),
              publishedAt: note.time || note.time_ms || note.timestamp || '',
              source: 'ssr-noteDetailMap',
            };
          }
        }

        // 从 noteData 提取
        const noteData = root.noteData?.data?.noteData || root.noteData?.noteData;
        if (noteData) {
          const note = noteData.note || noteData;
          const interact = note?.interact_info || note?.interactInfo || {};
          const user = note?.user || {};
          return {
            title: String(note.title || note.display_title || note.desc || '').trim(),
            authorName: String(user.nickname || '').trim() || undefined,
            authorId: String(user.user_id || user.userId || '').trim() || undefined,
            likes: Number(interact.liked_count || interact.likedCount || 0),
            comments: Number(interact.comment_count || interact.commentCount || 0),
            favorites: Number(interact.collected_count || interact.collectedCount || 0),
            shares: Number(interact.share_count || interact.shareCount || 0),
            publishedAt: note.time || note.time_ms || note.timestamp || '',
            source: 'ssr-noteData',
          };
        }

        return null;
      } catch (e) {
        return { error: String(e) };
      }
    }, parsed.postId).catch((err) => ({ error: String(err) }));
    console.log(`SSR 数据类型: ${ssrData ? typeof ssrData : 'null'}`);
    if (ssrData && typeof ssrData === 'object') {
      console.log(`SSR 顶层 keys: ${Object.keys(ssrData).slice(0, 20).join(', ')}`);
      if (ssrData.note) {
        console.log(`SSR note keys: ${Object.keys(ssrData.note).slice(0, 10).join(', ')}`);
        if (ssrData.note.noteDetailMap) {
          console.log(`SSR noteDetailMap keys: ${Object.keys(ssrData.note.noteDetailMap).slice(0, 5).join(', ')}`);
        }
      }
    }
    console.log();

    // 停止 HAR
    const har = harListener.stop();
    console.log(`【HAR 收集结果】共 ${har.entries.length} 条响应`);
    for (const entry of har.entries) {
      const hasJson = entry.jsonBody ? '✓ JSON' : '';
      const hasText = entry.textBody ? `✓ Text` : '';
      console.log(`  [${entry.status}] ${entry.method} ${entry.url.slice(0, 100)} ${hasJson} ${hasText}`);
    }
    console.log();

    if (dumpHar) {
      const harPath = path.join(PROJECT_ROOT, `test-har-${Date.now()}.json`);
      fs.writeFileSync(harPath, JSON.stringify(har.entries, null, 2));
      console.log(`HAR 已保存到: ${harPath}\n`);
    }

    // 数据提取
    if (platform === '小红书') {
      const extracted = extractXiaohongshu(har, ssrData, parsed.postId);
      console.log('【小红书数据提取结果】');
      console.log(JSON.stringify(extracted, null, 2));
    } else {
      console.log('【抖音】暂不支持');
    }
    console.log();

    // 截图
    const screenshotPath = path.join(COVERS_DIR, `test-screenshot-${Date.now()}.png`);
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1440, height: 1080 } });
    console.log(`【截图已保存】${screenshotPath}\n`);

    const title = await page.title().catch(() => '');
    console.log(`【页面标题】${title}`);

  } finally {
    await ctx.close();
    console.log('\n浏览器已关闭');
  }
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
