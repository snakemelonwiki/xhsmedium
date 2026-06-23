#!/usr/bin/env node
/**
 * debug-xhs-ssr.js — 调试小红书 SSR note 结构
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_ROOT = path.join(process.cwd(), '.playwright-profiles');
const profileDir = path.join(PROFILE_ROOT, 'xiaohongshu');

(async () => {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await ctx.newPage();
  const url = 'https://www.xiaohongshu.com/explore/6a112759000000003601c7f9?xsec_token=ABXNHX7vR3gQVDLpE_ISojDEdlvgjNikGlPcuwqzMhXhY=&xsec_source=pc_feed';

  console.log('导航中...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  console.log(`标题: ${await page.title().catch(() => '')}`);

  // 直接提取并打印 noteDetailMap 中第一个条目的完整结构
  const detail = await page.evaluate(() => {
    try {
      const root = window.__INITIAL_STATE__;
      const map = root?.note?.noteDetailMap;
      if (!map) return { error: 'no noteDetailMap' };

      const keys = Object.keys(map);
      if (keys.length === 0) return { error: 'empty map' };

      const entry = map[keys[0]];
      if (!entry) return { error: 'entry is null/undefined' };

      // entry 的结构：{ comments, currentTime, note }
      return {
        mapKey: keys[0],
        entryKeys: Object.keys(entry),
        hasNoteField: 'note' in entry,
        noteType: entry.note ? typeof entry.note : 'null/undefined',
        noteKeys: entry.note && typeof entry.note === 'object' ? Object.keys(entry.note).slice(0, 30) : null,
        // 提取 note 中的关键字段
        noteData: entry.note ? {
          id: entry.note.id,
          title: entry.note.title,
          desc: entry.note.desc,
          displayTitle: entry.note.display_title,
          time: entry.note.time,
          timeMs: entry.note.time_ms,
          timestamp: entry.note.timestamp,
          hasInteractInfo: !!(entry.note.interact_info || entry.note.interactInfo),
          interactInfoKeys: entry.note.interact_info ? Object.keys(entry.note.interact_info) : (entry.note.interactInfo ? Object.keys(entry.note.interactInfo) : null),
          hasUser: !!entry.note.user,
          userKeys: entry.note.user ? Object.keys(entry.note.user).slice(0, 10) : null,
        } : null,
      };
    } catch (e) {
      return { error: String(e) };
    }
  }).catch((err) => ({ error: String(err) }));

  console.log('\n【noteDetailMap 条目结构】');
  console.log(JSON.stringify(detail, null, 2));

  await ctx.close();
  console.log('\n浏览器已关闭');
})();
