import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockAdminEmployeesApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/employees' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'emp-001',
          name: '张三',
          employeeCode: 'EMP0001',
          status: '在职',
          department: '运营',
          phone: '13800000000',
        }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }

    if (path === '/users' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'user-001',
          employeeId: 'emp-001',
          username: 'zhangsan',
          role: 'staff',
          status: 'active',
        }],
        total: 1,
        limit: 500,
        offset: 0,
      });
    }

    if (path === '/users/staff' && method === 'POST') {
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

    if (path === '/auth/refresh' && method === 'POST') {
      return json(route, { token: 'admin-token' });
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

test('admin employees bind account duplicate username shows error message', async ({ page }) => {
  await mockAdminEmployeesApis(page);
  await setAdminAuth(page);

  await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '员工管理' })).toBeVisible();
  await expect(page.getByText('zhangsan')).toBeVisible();

  await page.getByRole('button', { name: '改绑定' }).click();
  await expect(page.getByRole('dialog', { name: '绑定登录账号' })).toBeVisible();

  await page.getByLabel('用户名').fill('existing-user');
  await page.getByLabel('密码').fill('test123456');
  await page.getByRole('button', { name: /确\s*定|OK/ }).click();

  await expect(page.locator('.ant-message')).toContainText('用户名已存在');
});
