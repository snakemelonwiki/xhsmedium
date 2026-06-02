// helpers/auth.ts
// 共享登录辅助：使用真实 API、不 mock，落地 Playwright 自动化基础。
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

export const SCREENSHOT_ROOT = resolve(__dirname, '../../../screenshots/b-acceptance-realapi');

export const ACCOUNTS = {
  sales1: { username: 'sales1', password: 'test123', role: 'sales' as const },
  sales2: { username: 'sales2', password: 'test123', role: 'sales' as const },
  staff1: { username: 'staff1', password: 'test123', role: 'staff' as const },
} as const;

export type SalesUser = 'sales1' | 'sales2';
export type StaffUser = 'staff1';

/**
 * 通过 UI 真实登录（不 mock、不写死 localStorage）。
 * 登录成功后等待落地目标 URL，并等 localStorage.token 写入。
 */
export async function loginAs(
  page: Page,
  user: SalesUser | StaffUser,
  expectPath: string | RegExp = /\/sales\//,
) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('用户名').fill(ACCOUNTS[user].username);
  await page.getByPlaceholder('密码').fill(ACCOUNTS[user].password);

  // 重试 2 次：dev 模式 HMR / 反代慢时偶发等不到响应
  let resp: import('@playwright/test').Response | null = null;
  for (let attempt = 1; attempt <= 2 && !resp; attempt++) {
    const loginResponse = page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: /登\s*录/ }).click();
    try {
      resp = await loginResponse;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[loginAs] 第 ${attempt} 次登录等响应超时，重试…`, err);
      if (attempt === 2) throw err;
    }
  }
  if (!resp) throw new Error('loginAs: 登录响应未拿到');
  if (!resp.ok()) {
    throw new Error(`登录失败：${ACCOUNTS[user].username} -> ${resp.status()} ${await resp.text()}`);
  }

  await page.waitForURL(expectPath, { timeout: 30_000, waitUntil: 'commit' });
  await page.waitForFunction(
    () => Boolean(window.localStorage.getItem('xhsmedium.token')),
    null,
    { timeout: 10_000 },
  );
}

export async function logout(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('xhsmedium.token');
    window.localStorage.removeItem('xhsmedium.user');
  });
  await page.context().clearCookies();
}

/**
 * 安全检测 localStorage 是否存在 token。
 * 必须在有 origin 的页面下调用（不能是 about:blank），
 * 否则 page.evaluate 会抛 SecurityError。
 */
export async function hasLoginToken(page: Page): Promise<boolean> {
  // 若当前是 about:blank / 错误页，先 goto 到登录页建立 origin
  const url = page.url();
  if (!url || url === 'about:blank' || !url.startsWith('http')) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
  }
  return page.evaluate(() => Boolean(window.localStorage.getItem('xhsmedium.token')));
}

/**
 * 跨 test 复用登录态：先有 origin，再判 token，没有则重新走 loginAs。
 * 必须在 page 已经访问过同 origin 页后调用（默认 loginAs 会建立）。
 */
export async function ensureLoggedInAs(
  page: Page,
  user: SalesUser | StaffUser,
  expectPath: string | RegExp = /\/sales\//,
) {
  const ok = await hasLoginToken(page);
  if (!ok) {
    await loginAs(page, user, expectPath);
  }
}

export async function screenshot(page: Page, task: string, name: string) {
  await page.screenshot({
    path: resolve(SCREENSHOT_ROOT, task, `${name}.png`),
    fullPage: true,
  });
}

/**
 * 等待某个 API 路径返回 200/201/204（默认 30 秒），并返回响应。
 * 用法：const resp = await waitForApi(page, '/api/leads');
 */
export async function waitForApiOk(
  page: Page,
  pathContains: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  timeout = 30_000,
) {
  const resp = await page.waitForResponse(
    (r) => r.url().includes(pathContains) && r.request().method() === method,
    { timeout },
  );
  return resp;
}
