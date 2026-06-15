import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockAdminExportsApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/exports' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'export-001',
          userId: 'admin-001',
          exportType: 'posts',
          filter: {},
          status: 'completed',
          fileUrl: '/tmp/export-001.csv',
          createdAt: '2026-06-10 10:00:00',
          finishedAt: '2026-06-10 10:01:00',
          updatedAt: '2026-06-10 10:01:00',
        }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }

    if (path.startsWith('/notifications')) {
      return json(route, {
        items: [],
        unreadCount: 0,
        total: 0,
        limit: 20,
        offset: 0,
      });
    }

    return json(route, { ok: true });
  });
}

async function setAdminAuth(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.setItem('xhsmedium.token', 'admin-token');
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: 'admin-001',
      name: '主管甲',
      role: 'admin',
      portType: 'admin',
    }));
  });
}

test('admin exports loads list data on first enter without manual refresh', async ({ page }) => {
  await mockAdminExportsApis(page);
  await setAdminAuth(page);

  await page.goto('/admin/exports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '导出中心' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '作品' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '成功' })).toBeVisible();
  await expect(page.getByRole('button', { name: '详情' })).toBeVisible();
});
