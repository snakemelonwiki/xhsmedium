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

test.describe('desktop layout (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

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
});

test.describe('mobile layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile hamburger button is visible and has accessible label', async ({ page }) => {
    await openOperationPosts(page);

    const hamburger = page.getByRole('button', { name: '打开菜单' });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute('aria-label', '打开菜单');
  });

  test('mobile drawer opens and closes via hamburger button', async ({ page }) => {
    await openOperationPosts(page);

    const hamburger = page.getByRole('button', { name: '打开菜单' });
    await hamburger.click();

    const drawer = page.getByRole('navigation');
    await expect(drawer).toBeVisible();

    // tapping again should close
    const closeBtn = page.getByRole('button', { name: '关闭菜单' });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('notification bell is visible on mobile', async ({ page }) => {
    await openOperationPosts(page);

    // The bell button renders "消息" as its visible text
    const bellBtn = page.getByRole('button', { name: /消息/ });
    await expect(bellBtn).toBeVisible();
  });

  test('notification bell opens a bottom drawer on mobile', async ({ page }) => {
    await openOperationPosts(page);

    const bellBtn = page.getByRole('button', { name: /消息/ });
    await bellBtn.click();

    // On mobile the NotificationBell renders a bottom Drawer instead of a Dropdown
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // The notification panel header should be visible inside the drawer
    await expect(page.getByText('消息提醒')).toBeVisible();

    // Close the drawer via Escape key
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('user menu button is accessible on mobile', async ({ page }) => {
    await openOperationPosts(page);

    const userBtn = page.getByRole('button', { name: '用户菜单' });
    await expect(userBtn).toBeVisible();
  });

  test('sidebar is hidden and no desktop sider element on mobile', async ({ page }) => {
    await openOperationPosts(page);

    await expect(page.locator('.app-sider')).not.toBeAttached();
  });
});
