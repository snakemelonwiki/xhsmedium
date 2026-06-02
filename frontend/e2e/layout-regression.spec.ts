import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function openOperationPosts(page: Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/notifications') {
      return json(route, { items: [], unreadCount: 0, total: 0, limit: 8, offset: 0 });
    }
    if (path === '/api/posts') {
      return json(route, { items: [], total: 0, limit: 20, offset: 0 });
    }
    return json(route, { ok: true });
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.setItem('xhsmedium.token', 'e2e-token');
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: 'user-operation',
      name: '运营同事',
      role: 'operation',
      employeeId: 'emp-operation',
      portType: 'operation',
    }));
  });
  await page.goto('/operation/posts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '作品列表' })).toBeVisible();
}

test('port title stays inside the shared header', async ({ page }) => {
  await openOperationPosts(page);

  const headerBox = await page.locator('.app-header').boundingBox();
  const titleBox = await page.getByRole('heading', { name: '运营端' }).boundingBox();

  expect(headerBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.y).toBeGreaterThanOrEqual(headerBox!.y);
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height);
});

test('sidebar menu uses links so Next can prefetch destinations', async ({ page }) => {
  await openOperationPosts(page);

  await expect(page.locator('.app-sider a[href="/operation/gallery"]')).toHaveText('作品广场');
});
