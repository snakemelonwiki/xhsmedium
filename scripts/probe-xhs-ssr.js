#!/usr/bin/env node
/**
 * probe-xhs-ssr.js — 探查小红书 __INITIAL_STATE__ 真实结构
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROFILE_ROOT = path.join(PROJECT_ROOT, '.playwright-profiles');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32') {
  const d = 'D:\\playwright-browsers';
  if (fs.existsSync(d)) process.env.PLAYWRIGHT_BROWSERS_PATH = d;
}

(async () => {
  const url = process.argv[2];
  const profileDir = path.join(PROFILE_ROOT, 'xiaohongshu');
  for (const n of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(profileDir, n), { force: true, recursive: true }); } catch {}
  }
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // 监听所有 xhs API
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('xiaohongshu.com') && (u.includes('/api/') || u.includes('/sns/'))) {
      console.log(`[API] ${res.status()} ${res.request().method()} ${u}`);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000); // 多等一会，让 SSR/CSR 充分填充

  console.log('\n=== 探查 SSR ===');
  const dump = await page.evaluate(() => {
    const out = { keys: [], note: null, sample: null };
    try {
      const root = window.__INITIAL_STATE__ || window.__initialState__;
      if (!root) return out;
      out.keys = Object.keys(root);
      if (root.note) {
        out.note = {
          keys: Object.keys(root.note),
          noteDetailMapSize: root.note.noteDetailMap ? Object.keys(root.note.noteDetailMap).length : 'no-key',
          noteDetailMapKeys: root.note.noteDetailMap ? Object.keys(root.note.noteDetailMap).slice(0, 5) : [],
          firstNoteId: root.note.firstNoteId,
          currentNoteId: root.note.currentNoteId,
        };
        // 如果有 detail map，dump 第一条结构
        if (root.note.noteDetailMap && Object.keys(root.note.noteDetailMap).length > 0) {
          const firstKey = Object.keys(root.note.noteDetailMap)[0];
          const entry = root.note.noteDetailMap[firstKey];
          out.sample = {
            key: firstKey,
            entryKeys: entry ? Object.keys(entry) : [],
            noteKeys: entry?.note ? Object.keys(entry.note) : [],
            title: entry?.note?.title || entry?.note?.display_title || entry?.note?.desc?.slice(0, 80),
            interact: entry?.note?.interact_info,
          };
        }
      }
      // 找页面上任何带 noteId 的 state
      out.allDeep = JSON.stringify(root).length;
    } catch (e) { out.err = String(e); }
    return out;
  });
  console.log(JSON.stringify(dump, null, 2));

  // 等待并轮询直到 noteDetailMap 非空（最多 8s）
  console.log('\n=== 轮询 SSR 直到 noteDetailMap 有数据 ===');
  for (let i = 0; i < 16; i++) {
    const ok = await page.evaluate(() => {
      const m = window.__INITIAL_STATE__?.note?.noteDetailMap;
      return m ? Object.keys(m).length : 0;
    });
    console.log(`  t+${(i + 1) * 500}ms: noteDetailMap=${ok}`);
    if (ok > 0) break;
    await page.waitForTimeout(500);
  }

  // 最终再 dump 一次
  const after = await page.evaluate(() => {
    const m = window.__INITIAL_STATE__?.note?.noteDetailMap;
    if (!m) return null;
    const out = {};
    for (const k of Object.keys(m).slice(0, 3)) {
      const e = m[k];
      const n = e?.note || e;
      out[k] = {
        title: n?.title || n?.display_title || (n?.desc || '').slice(0, 80),
        interact: n?.interact_info,
        time: n?.time,
        user: n?.user?.nickname,
      };
    }
    return out;
  });
  console.log('\n=== 最终 noteDetailMap ===');
  console.log(JSON.stringify(after, null, 2));

  await page.waitForTimeout(2000);
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
