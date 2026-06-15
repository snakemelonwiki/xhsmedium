import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/test-error' && method === 'POST') {
      return json(route, { message: '用户名已存在' }, 400);
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

test('static antd message renders error toast on admin pages', async ({ page }) => {
  await mockApis(page);
  await setAdminAuth(page);

  await page.goto('/admin/test-error-handling', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('API错误处理测试')).toBeVisible();

  await page.getByRole('button', { name: '测试模拟错误接口' }).click();

  await expect(page.locator('.ant-message')).toContainText('用户名已存在');
});
