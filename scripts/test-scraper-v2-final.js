#!/usr/bin/env node
/**
 * test-scraper-v2-final.js — 测试 A+B 修正后的完整链路
 *
 * A: 小红书不拦截资源 + page.evaluate SSR 提取
 * B: 抖音 RSC flight data 完整 JS 字符串转义
 *
 * 用法：
 *   node scripts/test-scraper-v2-final.js <url> [--timeout N]
 */

const path = require("path");
const fs = require("fs");
const { chromium } = require('playwright');

function resolveProjectRoot() {
  const candidates = [path.resolve(__dirname, '..'), process.env.PROJECT_ROOT || '', process.cwd()];
  for (const c of candidates) {
    if (!c) continue;
    if (fs.existsSync(path.join(c, '.playwright-profiles')) || fs.existsSync(path.join(c, 'uploads'))) return c;
  }
  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
const PROFILE_ROOT = path.join(PROJECT_ROOT, '.playwright-profiles');
const COVERS_DIR = path.join(PROJECT_ROOT, 'uploads', 'post-covers');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32') {
  const d = 'D:\\playwright-browsers';
  if (fs.existsSync(d)) process.env.PLAYWRIGHT_BROWSERS_PATH = d;
}

function parseUrl(raw) {
  const url = String(raw || '').trim();
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com')) {
      const m = url.match(/\/explore\/([a-zA-Z0-9]+)/i);
      if (m) return { platform: 'xiaohongshu', postId: m[1] };
      return { platform: 'xiaohongshu', postId: null };
    }
    if (hostname === 'douyin.com' || hostname.endsWith('.douyin.com')) {
      const m = url.match(/\/(?:video|note)\/(\d+)/i) || url.match(/[?&]modal_id=(\d+)/i);
      if (m) return { platform: 'douyin', postId: m[1] };
      return { platform: 'douyin', postId: null };
    }
  } catch { /* 短链等非法 URL，兜底 */ }
  if (url.toLowerCase().includes('xhslink.com')) return { platform: 'xiaohongshu', postId: null };
  if (url.toLowerCase().includes('v.douyin.com')) return { platform: 'douyin', postId: null };
  return { platform: null, postId: null };
}

class HarListener {
  constructor(page, opts = {}) { this.page = page; this.opts = opts; this.entries = []; this.handler = (r) => this.onResponse(r).catch(()=>{}); }
  start() { this.page.on('response', this.handler); }
  stop() { this.page.off('response', this.handler); return { entries: this.entries }; }
  async onResponse(response) {
    try {
      const url = response.url();
      if (this.opts.urlFilter?.length && !this.opts.urlFilter.some((re) => re.test(url))) return;
      const request = response.request();
      const resourceType = request.resourceType();
      const excludeTypes = this.opts.excludeResourceTypes || new Set(['image', 'stylesheet', 'font', 'media', 'websocket', 'eventsource']);
      if (excludeTypes.has(resourceType)) return;
      const status = response.status();
      let contentType = '';
      try { contentType = (response.headers()['content-type'] || '').toLowerCase(); } catch { /* ignore */ }
      const entry = { url, method: request.method(), status, contentType, jsonBody: null, textBody: null };
      if (status >= 200 && status < 300 && contentType.includes('application/json')) {
        try { entry.jsonBody = await response.json(); } catch { try { entry.textBody = await response.text(); } catch {} }
      } else if (status >= 200 && status < 300 && contentType.includes('text/html')) {
        try { entry.textBody = await response.text(); } catch {} }
      this.entries.push(entry);
    } catch { /* ignore */ }
  }
}

function parseCount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim().toLowerCase().replace(/,/g, '');
  if (!text) return 0;
  const m = text.match(/(\d+(?:\.\d+)?)\s*([wk万千k]?)/);
  if (!m) return Number(text) || 0;
  const n = Number(m[1]);
  const u = m[2].trim();
  if (Number.isNaN(n)) return 0;
  if (u === 'w' || u === '万') return Math.round(n * 10000);
  if (u === 'k' || u === '千') return Math.round(n * 1000);
  return Math.round(n);
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

// ── 新版小红书 Extractor（Hybrid: SSR evaluate + HAR）──
function extractXiaohongshu(har, ssrData, noteIdHint) {
  // 优先级 1: SSR evaluate
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
          source: 'ssr-noteDetailMap',
        };
      }
    }
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
  if (!url) { console.error('用法: node test-scraper-v2-final.js <url>'); process.exit(1); }

  const parsed = parseUrl(url);
  console.log('URL 分类:', parsed);
  if (!parsed.platform) { console.error('不支持'); process.exit(1); }

  const platform = parsed.platform === 'xiaohongshu' ? '小红书' : '抖音';
  const profileDir = path.join(PROFILE_ROOT, platform === '抖音' ? 'douyin' : 'xiaohongshu');
  fs.mkdirSync(profileDir, { recursive: true });
  for (const n of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(profileDir, n), { force: true, recursive: true }); } catch {}
  }

  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: platform !== '小红书',
    viewport: { width: 1440, height: 1100 },
    args: [
      ...(platform !== '小红书' ? ['--disable-remote-fonts'] : []),
      ...(platform === '抖音' ? ['--disable-blink-features=AutomationControlled'] : []),
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
    ],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  let page;
  try {
    page = await ctx.newPage();

    // A: 小红书不拦截资源，抖音拦截
    if (platform === '抖音') {
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(type)) route.abort();
        else route.continue();
      });
    }

    const harListener = new HarListener(page, {
      urlFilter: [/\/api\/sns\/web\/v[12]\/feed/i, /\/api\/sns\/web\/v\d+\/note\b/i, /\/aweme\/v1\/web\/aweme\/detail\//i, /RENDER_DATA/i],
      excludeResourceTypes: new Set(['image', 'stylesheet', 'font', 'media', 'websocket', 'eventsource']),
    });
    harListener.start();

    console.log(`导航: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    console.log(`标题: ${await page.title().catch(() => '')}\n`);

    // A: page.evaluate 内部提取 SSR（仅小红书）
    let ssrData = null;
    if (platform === '小红书') {
      ssrData = await page.evaluate(() => {
        try {
          return (window.__INITIAL_STATE__ || window.__initialState__ || null);
        } catch { return null; }
      }).catch(() => null);
      if (ssrData && typeof ssrData === 'object') {
        console.log(`SSR 顶层 keys: ${Object.keys(ssrData).slice(0, 20).join(', ')}`);
        if (ssrData.note) {
          console.log(`SSR note keys: ${Object.keys(ssrData.note).slice(0, 10).join(', ')}`);
          if (ssrData.note.noteDetailMap) {
            console.log(`SSR noteDetailMap keys: ${Object.keys(ssrData.note.noteDetailMap).slice(0, 5).join(', ')}`);
          }
        }
      } else {
        console.log('SSR 数据为空');
      }
      console.log();
    }

    const har = harListener.stop();
    console.log(`HAR 条目: ${har.entries.length}`);
    for (const entry of har.entries) {
      console.log(`  [${entry.status}] ${entry.method} ${entry.url.slice(0, 100)} ${entry.jsonBody ? '✓ JSON' : entry.textBody ? '✓ Text' : ''}`);
    }
    console.log();

    if (platform === '小红书') {
      const extracted = extractXiaohongshu(har, ssrData, parsed.postId);
      console.log('【小红书提取结果】');
      console.log(JSON.stringify(extracted, null, 2));
    } else {
      console.log('【抖音】暂不支持');
    }
    console.log();

    // 截图
    const screenshotPath = path.join(COVERS_DIR, `test-screenshot-${Date.now()}.png`);
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1440, height: 1080 } });
    console.log(`【截图】${screenshotPath}`);

  } finally {
    await ctx.close();
    console.log('\n浏览器已关闭');
  }
}

main().catch((err) => { console.error('失败:', err); process.exit(1); });
