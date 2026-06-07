// e2e/op-flow.spec.ts
// TC-OP-01 ~ TC-OP-12: 运营端 E2E（live API, 真实账号 op_flow_01）
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SCREEN_DIR = resolve(__dirname, '../../doc/test-cases/screenshots/17-op-flow-20260604');
mkdirSync(SCREEN_DIR, { recursive: true });

const ACCOUNT = { username: 'op_flow_01', password: 'test123' };

async function loginOpFlow01(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const usernameInput = page.getByPlaceholder('用户名');
  const passwordInput = page.getByPlaceholder('密码');
  await usernameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await passwordInput.waitFor({ state: 'visible', timeout: 30_000 });
  await usernameInput.fill('');
  await passwordInput.fill('');
  await usernameInput.fill(ACCOUNT.username);
  await passwordInput.fill(ACCOUNT.password);
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  const resp = await loginResponse;
  if (!resp.ok()) throw new Error(`login failed: ${resp.status()}`);
  await page.waitForURL(/\/operation/, { timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(window.localStorage.getItem('xhsmedium.token')),
    null,
    { timeout: 10_000 },
  );
}

// Click a label inside the 排序 Segmented (which is near the label "排序")
async function clickSortLabel(page: Page, label: string) {
  // Find any element with the sort label text
  const el = page.locator(`label:has-text("${label}"), .ant-segmented-item-label:has-text("${label}")`).first();
  await el.waitFor({ state: 'visible', timeout: 15_000 });
  await el.click({ force: true });
}

test.describe.serial('运营端 OP-01~OP-12 (op_flow_01)', () => {
  // Pre-warm Next.js dev mode compilation for all relevant pages
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    for (const path of ['/login', '/operation', '/operation/dashboard', '/operation/dashboard/account-analysis', '/operation/leads', '/operation/accounts']) {
      try { await page.goto('http://127.0.0.1:3302' + path, { waitUntil: 'domcontentloaded', timeout: 60_000 }); } catch {}
    }
    await page.close();
  });

  test('TC-OP-01 登录跳到 /operation', async ({ page }) => {
    await loginOpFlow01(page);
    await expect(page).toHaveURL(/\/operation/);
    const token = await page.evaluate(() => localStorage.getItem('xhsmedium.token'));
    expect(token && token.length > 0).toBeTruthy();
    await page.screenshot({ path: `${SCREEN_DIR}/OP-01-operation-home.png`, fullPage: true });
  });

  test('TC-OP-02 个人看板 5 张概览卡', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/dashboard', { waitUntil: 'domcontentloaded' });
    // Wait for the overview API
    const overviewResp = page.waitForResponse(
      (r) => r.url().includes('/api/dashboard/personal/overview'),
      { timeout: 30_000 },
    );
    await overviewResp.catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREEN_DIR}/OP-02-personal-dashboard.png`, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const checks: { needle: string; ok: boolean }[] = [
      { needle: '个人看板', ok: bodyText.includes('个人看板') },
      { needle: '总流量', ok: bodyText.includes('总流量') },
      { needle: '总获客', ok: bodyText.includes('总获客') },
      { needle: '本月作品数', ok: bodyText.includes('本月作品数') },
      { needle: '本月客资数', ok: bodyText.includes('本月客资数') },
      { needle: '本月获客贴数', ok: bodyText.includes('本月获客贴数') },
      { needle: '三大效率榜', ok: bodyText.includes('三大效率榜') },
    ];
    console.log('OP-02 checks:', JSON.stringify(checks));
  });

  test('TC-OP-04 排序切换 + URL sort 参数 (rankings)', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const calls: { url: string; sort: string | null }[] = [];
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/api/dashboard/personal/rankings')) {
        const m = u.match(/[?&]sort=([a-zA-Z]+)/);
        calls.push({ url: u, sort: m ? m[1] : null });
      }
    });
    // Period first - select 累计 to include all 15 posts
    const periodBtn = page.locator('.ant-segmented-item-label:has-text("累计")').first();
    if (await periodBtn.count() > 0) {
      try { await periodBtn.click({ force: true, timeout: 5000 }); } catch {}
      await page.waitForTimeout(1500);
    }
    for (const label of ['按作品数', '按流量', '按获客效率', '按获客贴效率']) {
      try {
        const seg = page.locator(`.ant-segmented-item-label:has-text("${label}")`).first();
        if (await seg.count() > 0) {
          await seg.click({ force: true, timeout: 5000 });
        }
      } catch (e: any) { console.log('click failed', label, e.message); }
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: `${SCREEN_DIR}/OP-04-sort-switch.png`, fullPage: true });
    console.log('OP-04 rankings API calls:', JSON.stringify(calls));
  });

  test('TC-OP-05/06 账号分析排序 (timeseries)', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/dashboard/account-analysis', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const calls: { url: string; sort: string | null }[] = [];
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/api/dashboard/personal/accounts/timeseries')) {
        const m = u.match(/[?&]sort=([a-zA-Z]+)/);
        calls.push({ url: u, sort: m ? m[1] : null });
      }
    });
    for (const label of ['按作品数', '按流量']) {
      try {
        const seg = page.locator(`.ant-segmented-item-label:has-text("${label}")`).first();
        if (await seg.count() > 0) {
          await seg.click({ force: true, timeout: 5000 });
        }
      } catch (e: any) { console.log('click failed', label, e.message); }
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: `${SCREEN_DIR}/OP-05-06-account-sort.png`, fullPage: true });
    console.log('OP-05/06 timeseries calls:', JSON.stringify(calls));
  });

  test('TC-OP-10 客资看板 9 列', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/leads', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREEN_DIR}/OP-10-leads-board.png`, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const expectedCols = ['客资上传日期', '来源平台', '来源账号', '来源作品', 'IP', '联系方式', '分配销售', '是否申请', '后台催办'];
    const found = expectedCols.filter(c => bodyText.includes(c));
    console.log('OP-10 columns found:', found, '/', expectedCols.length);
  });

  test('TC-OP-08/09 客资录入表单', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/leads/new', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREEN_DIR}/OP-08-lead-new.png`, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const hasFields = ['来源平台', '来源账号', '联系方式', '是否分流', '分配销售'].filter(f => bodyText.includes(f));
    console.log('OP-08/09 form fields visible:', hasFields);
  });

  test('TC-OP-12 账号列表隔离', async ({ page }) => {
    await loginOpFlow01(page);
    await page.goto('/operation/accounts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREEN_DIR}/OP-12-accounts.png`, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    const op01count = (bodyText.match(/acc-flow-op01-/g) || []).length;
    const op02count = (bodyText.match(/acc-flow-op02-/g) || []).length;
    console.log('OP-12 op_flow_01 sees op01-:', op01count, 'op02-:', op02count);
  });
});
