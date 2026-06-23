#!/usr/bin/env node
/**
 * probe-xhs-v2.js — 安全探查（用 JSON.stringify + replacer 在浏览器内序列化）
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

  const apis = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('xiaohongshu.com') && (u.includes('/api/') || u.includes('/sns/'))) {
      apis.push({ s: res.status(), m: res.request().method(), u });
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 1. 是否登录
  const userMe = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/sns/web/v2/user/me', { credentials: 'include' });
      return await r.json();
    } catch (e) { return { err: String(e) }; }
  });
  console.log('\n=== 登录态 (user/me) ===');
  console.log(JSON.stringify(userMe, null, 2).slice(0, 500));

  // 2. SSR 顶层结构 + 关键路径
  const ssrInfo = await page.evaluate(() => {
    const safeStringify = (obj, maxDepth = 6) => {
      const seen = new WeakSet();
      return JSON.stringify(obj, (_k, v) => {
        if (typeof v === 'bigint') return String(v);
        if (typeof v === 'function') return undefined;
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return undefined;
          seen.add(v);
        }
        return v;
      });
    };
    const root = window.__INITIAL_STATE__ || window.__initialState__;
    if (!root) return { hasRoot: false };
    const info = { hasRoot: true, topKeys: Object.keys(root) };
    if (root.note) {
      info.noteKeys = Object.keys(root.note);
      info.firstNoteId = root.note.firstNoteId;
      info.currentNoteId = root.note.currentNoteId;
      const map = root.note.noteDetailMap;
      if (map) {
        info.mapKeys = Object.keys(map);
        if (info.mapKeys.length > 0) {
          const first = map[info.mapKeys[0]];
          info.mapSample = safeStringify(first).slice(0, 4000);
        }
      }
    }
    return info;
  });
  console.log('\n=== SSR 结构 ===');
  console.log(JSON.stringify(ssrInfo, null, 2).slice(0, 3000));

  // 3. DOM 上的指标（小红书页面右下角的赞/藏/评/分享）
  const domData = await page.evaluate(() => {
    const out = { title: document.title, ogTitle: '', metrics: {} };
    out.ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';

    // 尝试找指标
    const text = document.body.innerText.slice(0, 3000);
    out.bodyHead = text;
    return out;
  });
  console.log('\n=== DOM ===');
  console.log('title:', domData.title);
  console.log('og:title:', domData.ogTitle);
  console.log('body head:\n', domData.bodyHead);

  console.log('\n=== 全部 API 调用 ===');
  apis.forEach((a) => console.log(`  [${a.s}] ${a.m} ${a.u}`));

  await page.waitForTimeout(2000);
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
