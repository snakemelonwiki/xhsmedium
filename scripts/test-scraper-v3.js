#!/usr/bin/env node
/**
 * test-scraper-v3.js — 验证 2026-06-21 v3 重构后的链路
 *
 * 与 v2/v2-final 的区别：
 *   - 直接复用 backend 编译后的 XiaohongshuExtractor（确保测出的是真实生产代码）
 *   - page.evaluate 只 JSON.stringify(__INITIAL_STATE__)，不在浏览器里做解析
 *   - 测试 noteIdHint 精确匹配 noteDetailMap
 *
 * 用法：node scripts/test-scraper-v3.js <url>
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { XiaohongshuExtractor } = require(
  path.resolve(__dirname, '../backend/dist/src/modules/scraping/core/extractors/xiaohongshu.extractor.js'),
);
const { parseUrl } = require(
  path.resolve(__dirname, '../backend/dist/src/modules/scraping/core/url-parser.js'),
);
const { HarListener } = require(
  path.resolve(__dirname, '../backend/dist/src/modules/scraping/core/har-listener.js'),
);

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

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('用法: node scripts/test-scraper-v3.js <url>');
    process.exit(1);
  }

  const parsed0 = parseUrl(url);
  console.log('[1] URL 分类:', parsed0);
  if (!parsed0.platform) { console.error('不支持的平台'); process.exit(1); }

  const platform = parsed0.platform === 'xiaohongshu' ? '小红书' : '抖音';
  const profileDir = path.join(PROFILE_ROOT, platform === '抖音' ? 'douyin' : 'xiaohongshu');
  fs.mkdirSync(profileDir, { recursive: true });
  for (const n of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(profileDir, n), { force: true, recursive: true }); } catch { /* ignore */ }
  }

  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: platform !== '小红书',
    viewport: { width: 1440, height: 1100 },
    args: [
      ...(platform === '抖音' ? ['--disable-blink-features=AutomationControlled'] : []),
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
    ],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  let page;
  try {
    page = await ctx.newPage();

    if (platform === '抖音') {
      await page.route('**/*', (route) => {
        const t = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media', 'websocket'].includes(t)) route.abort();
        else route.continue();
      });
    }

    const harListener = new HarListener(page, {
      urlFilter: [
        /\/api\/sns\/web\/v[12]\/feed/i,
        /\/api\/sns\/web\/v\d+\/note\b/i,
        /\/aweme\/v1\/web\/aweme\/detail\//i,
        /RENDER_DATA/i,
      ],
      excludeResourceTypes: new Set(['image', 'stylesheet', 'font', 'media', 'websocket', 'eventsource']),
      maxEntries: 100,
    });
    harListener.start();

    console.log(`\n[2] 导航: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 重定向后回写 parsed
    let parsed = parsed0;
    const finalUrl = page.url();
    if (finalUrl && finalUrl !== url) {
      const reparsed = parseUrl(finalUrl);
      if (reparsed.platform === parsed.platform) {
        parsed = { ...parsed, ...reparsed };
      }
      console.log(`[2.1] 重定向后 URL: ${finalUrl}, postId=${parsed.postId}`);
    }

    console.log(`[3] 页面标题: ${await page.title().catch(() => '')}`);

    // SSR: 在浏览器内沿已知路径取标量字段（Vue 3 reactive 不能整体 stringify）
    const ssrExtracted = await page.evaluate((hint) => {
      try {
        const root = window.__INITIAL_STATE__ || window.__initialState__ || null;
        if (!root || typeof root !== 'object') return null;

        const shapeNote = (note) => {
          if (!note || typeof note !== 'object') return null;
          const interact = note.interact_info || note.interactInfo || {};
          const user = note.user || {};
          return {
            title: String(note.title || note.display_title || note.desc || '').trim(),
            authorName: String(user.nickname || '').trim() || undefined,
            authorId: String(user.user_id || user.userId || '').trim() || undefined,
            likes: Number(interact.liked_count ?? interact.likedCount ?? 0),
            comments: Number(interact.comment_count ?? interact.commentCount ?? 0),
            favorites: Number(interact.collected_count ?? interact.collectedCount ?? 0),
            shares: Number(interact.share_count ?? interact.shareCount ?? 0),
            time: Number(note.time ?? note.time_ms ?? 0),
          };
        };

        const map = root.note?.noteDetailMap;
        if (map && typeof map === 'object') {
          if (hint && map[hint]) {
            const raw = map[hint];
            const note = raw?.note || raw?.data?.note || raw;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-map-hint' };
          }
          const keys = Object.keys(map);
          if (keys.length === 1) {
            const raw = map[keys[0]];
            const note = raw?.note || raw?.data?.note || raw;
            const s = shapeNote(note);
            if (s) return { ...s, _source: 'ssr-map-only' };
          }
        }
        const ptrId = root.note?.firstNoteId || root.note?.currentNoteId;
        if (ptrId && map?.[ptrId]) {
          const raw = map[ptrId];
          const note = raw?.note || raw?.data?.note || raw;
          const s = shapeNote(note);
          if (s) return { ...s, _source: 'ssr-ptr' };
        }
        const noteData = root.noteData?.data?.noteData || root.noteData?.noteData;
        if (noteData) {
          const note = noteData.note || noteData;
          const s = shapeNote(note);
          if (s) return { ...s, _source: 'ssr-noteData' };
        }
        return null;
      } catch { return null; }
    }, parsed.postId).catch(() => null);

    console.log(`[4] SSR ${ssrExtracted ? `OK (${ssrExtracted._source}) 赞${ssrExtracted.likes} 评${ssrExtracted.comments} 藏${ssrExtracted.favorites}` : '空'}`);
    if (ssrExtracted) console.log('    extract:', JSON.stringify(ssrExtracted));

    const har = harListener.stop();
    console.log(`[5] HAR 条目: ${har.entries.length}`);
    for (const entry of har.entries) {
      console.log(`    [${entry.status}] ${entry.method} ${entry.url.slice(0, 110)} ${entry.jsonBody ? '✓ JSON' : entry.textBody ? '✓ Text' : ''}`);
    }

    const extractor = new XiaohongshuExtractor();
    const result = extractor.extract(har, ssrExtracted, parsed.postId);
    console.log('\n[6] 【提取结果】');
    console.log(JSON.stringify(result, null, 2));

    // 截图
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    const shot = path.join(COVERS_DIR, `v3-test-${Date.now()}.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 1080 } });
    console.log(`\n[7] 截图: ${shot}`);

  } finally {
    await ctx.close();
    console.log('\n浏览器已关闭');
  }
}

main().catch((err) => { console.error('失败:', err); process.exit(1); });
