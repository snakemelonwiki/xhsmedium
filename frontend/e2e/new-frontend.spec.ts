import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/auth/login' && method === 'POST') {
      return json(route, {
        token: 'e2e-token',
        user: { id: 'user-sales', username: 'sales', role: 'sales', employeeId: 'emp-sales', employeeName: '销售' },
      });
    }

    if (path === '/notifications/read-all' && method === 'POST') {
      return json(route, { ok: true, affected: 1 });
    }
    if (path.match(/^\/notifications\/[^/]+\/read$/) && method === 'POST') {
      return json(route, { ok: true, changed: true });
    }
    if (path === '/notifications' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'notice-1',
          typeCode: 'lead_assigned',
          title: '新客资提醒',
          content: '客户A 已分配给你',
          readStatus: 0,
          createdAt: '2026-05-31 13:00:00',
          relatedType: 'lead',
          relatedId: 'lead-1',
        }],
        unreadCount: 1,
        total: 1,
        limit: 20,
        offset: 0,
      });
    }

    if (path === '/leads/passive/candidates' && method === 'GET') {
      return json(route, {
        items: [{ id: 'lead-1', nickname: '客户A', contactInfo: 'wx-a', platform: 'xiaohongshu' }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path === '/leads/passive/bind' && method === 'POST') {
      return json(route, { ok: true });
    }
    if (path === '/leads/lead-1/follow-records' && method === 'GET') {
      return json(route, { items: [], total: 0, limit: 50, offset: 0 });
    }
    if (path === '/leads/lead-1' && method === 'GET') {
      return json(route, {
        id: 'lead-1',
        nickname: '客户A',
        contactInfo: 'wx-a',
        status: 'assigned',
        addStatus: 'not_added',
        processStatus: 'not_contacted',
      });
    }
    if (path === '/leads' && method === 'GET') {
      return json(route, {
        items: [{ id: 'lead-1', nickname: '客户A', contactInfo: 'wx-a', status: 'assigned', addStatus: 'not_added', processStatus: 'not_contacted' }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }

    if (path === '/posts/plaza' && method === 'GET') {
      return json(route, {
        ok: true,
        rows: [{ id: 'post-1', title: '作品A', platform: 'xiaohongshu', postType: 'note', likes: 10, leadsCount: 1, favoriteCount: 0, isFavorited: false }],
      });
    }
    if (path === '/favorites/toggle' && method === 'POST') {
      return json(route, { favorited: true, favorites: 1 });
    }
    if (path === '/posts/post-1' && method === 'GET') {
      return json(route, {
        id: 'post-1',
        title: '作品A',
        platform: 'xiaohongshu',
        postType: 'note',
        postUrl: 'https://example.com/post',
        accountId: 'account-1',
        copywriting: '原始文案',
        traffic: 100,
        likes: 10,
        comments: 2,
        favorites: 3,
      });
    }
    if (path === '/posts/post-1' && method === 'PUT') {
      return json(route, { ok: true });
    }
    if (path === '/posts' && method === 'GET') {
      return json(route, {
        items: [{ id: 'post-1', title: '作品A', platform: 'xiaohongshu', postType: 'note', likes: 10, postUrl: 'https://example.com/post' }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path === '/posts' && method === 'POST') {
      return json(route, { ok: true });
    }

    if (path === '/orders' && method === 'GET') {
      return json(route, {
        items: [{ id: 'order-1', salesUserId: 'user-sales', academicUserId: 'user-academic', orderStatus: 'to_receive', paidStatus: 'unpaid', amount: '1000' }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path === '/collaboration-tasks' && method === 'GET') {
      return json(route, { items: [], total: 0, limit: 20, offset: 0 });
    }
    if (path === '/dashboard/summary' && method === 'GET') {
      return json(route, {});
    }
    if (path === '/dashboard/post-type-distribution' && method === 'GET') {
      return json(route, []);
    }
    if (path === '/rankings' && method === 'GET') {
      return json(route, { items: [], total: 0, limit: 20, offset: 0 });
    }
    if (path === '/import-tasks' && method === 'GET') {
      return json(route, { items: [], total: 0, limit: 20, offset: 0 });
    }

    return json(route, { ok: true });
  });
}

async function setAuthRole(page: Page, role: 'operation' | 'sales' | 'academic' | 'admin') {
  await page.evaluate((nextRole) => {
    window.localStorage.setItem('xhsmedium.token', 'e2e-token');
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: `user-${nextRole}`,
      name: nextRole,
      role: nextRole,
      employeeId: `emp-${nextRole}`,
      portType: nextRole,
    }));
  }, role);
}

test('new frontend routes and migrated interactions work with mocked backend', async ({ page }) => {
  await mockApi(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '登录运营中台' })).toBeVisible();

  await setAuthRole(page, 'sales');
  await page.goto('/sales/leads');
  await expect(page.getByRole('heading', { name: '我的客资' })).toBeVisible();
  await expect(page.getByText('客户A')).toBeVisible();

  await setAuthRole(page, 'operation');
  await page.goto('/operation/posts/new');
  await expect(page.getByRole('heading', { name: '作品录入' })).toBeVisible();
  await page.getByLabel('作品链接').fill('https://example.com/post');
  await page.getByLabel('标题').fill('新作品');
  const createPostResponse = page.waitForResponse((response) =>
    response.url().includes('/api/posts') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交作品' }).click();
  await expect((await createPostResponse).ok()).toBeTruthy();

  await page.goto('/operation/posts');
  await expect(page.getByRole('heading', { name: '作品列表' })).toBeVisible();
  await page.locator('a[href="/operation/posts/post-1/edit"]').click();
  await expect(page.getByRole('heading', { name: '编辑作品' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('标题').fill('作品A 已编辑');
  const updatePostResponse = page.waitForResponse((response) =>
    response.url().includes('/api/posts/post-1') && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '保存作品' }).click();
  await expect((await updatePostResponse).ok()).toBeTruthy();

  await page.goto('/operation/gallery');
  await expect(page.getByRole('heading', { name: '作品广场' })).toBeVisible();
  await expect(page.getByText('作品A')).toBeVisible();
  const favoriteResponse = page.waitForResponse((response) =>
    response.url().includes('/api/favorites/toggle') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '收藏' }).click();
  await expect((await favoriteResponse).ok()).toBeTruthy();

  await setAuthRole(page, 'sales');
  await page.goto('/sales/passive-leads');
  await expect(page.getByRole('heading', { name: '待确认被动添加' })).toBeVisible();
  await expect(page.getByText('客户A')).toBeVisible();

  await page.goto('/sales/messages');
  await expect(page.getByRole('heading', { name: '销售消息' })).toBeVisible();
  await expect(page.getByText('新客资提醒')).toBeVisible();
  const readAllResponse = page.waitForResponse((response) =>
    response.url().includes('/api/notifications/read-all') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '全部已读' }).click();
  await expect((await readAllResponse).ok()).toBeTruthy();

  await setAuthRole(page, 'academic');
  await page.goto('/academic/orders');
  await expect(page.getByRole('heading', { name: '订单池' })).toBeVisible();

  await setAuthRole(page, 'admin');
  await page.goto('/admin/leads');
  await expect(page.getByRole('heading', { name: '主管客资' })).toBeVisible();
});
