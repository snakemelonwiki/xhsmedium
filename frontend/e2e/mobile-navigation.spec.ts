import { expect, test, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (route: Route, body: unknown) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Mock the minimal API surface needed for any authenticated page:
 * notifications (fetched by NotificationContext) and a generic fallback.
 * Callers can add more specific route overrides by calling page.route after this.
 */
async function mockCoreApi(page: Page) {
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
}

type TestRole = 'operation' | 'sales' | 'academic' | 'admin';

/**
 * Navigate to /login first (to establish origin), write auth into localStorage,
 * then navigate to `targetPath`. API is mocked so the page can render its layout.
 */
async function setupAuthAndGo(page: Page, role: TestRole, targetPath: string) {
  await mockCoreApi(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (r) => {
      window.localStorage.setItem('xhsmedium.token', 'e2e-token');
      window.localStorage.setItem(
        'xhsmedium.user',
        JSON.stringify({
          id: `user-${r}`,
          name: r,
          role: r,
          employeeId: `emp-${r}`,
          portType: r,
        }),
      );
    },
    role,
  );
  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
}

// ---------------------------------------------------------------------------
// Mobile tests (iPhone 14 Pro viewport)
// ---------------------------------------------------------------------------

test.describe('Mobile navigation (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('login page renders correctly on mobile viewport', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '登录工作台' })).toBeVisible();

    // Form controls should be usable on the small screen
    await expect(page.getByPlaceholder('用户名')).toBeVisible();
    await expect(page.getByPlaceholder('密码')).toBeVisible();
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
  });

  test('hamburger menu button is visible after authentication', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    const hamburger = page.getByRole('button', { name: '打开菜单' });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute('aria-label', '打开菜单');
  });

  test('hamburger opens the navigation drawer', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');

    await page.getByRole('button', { name: '打开菜单' }).click();
    const drawer = page.getByRole('navigation');
    await expect(drawer).toBeVisible();

    // The close button replaces the open button
    await expect(page.getByRole('button', { name: '关闭菜单' })).toBeVisible();
  });

  test('drawer contains menu items matching the operation role', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    await page.getByRole('button', { name: '打开菜单' }).click();

    const nav = page.getByRole('navigation');
    // Key operation menu items that must appear
    await expect(nav.getByText('作品广场')).toBeVisible();
    await expect(nav.getByText('客资看板')).toBeVisible();
    await expect(nav.getByText('我的作品')).toBeVisible();
    await expect(nav.getByText('账号管理')).toBeVisible();
  });

  test('drawer contains menu items matching the sales role', async ({ page }) => {
    await setupAuthAndGo(page, 'sales', '/sales/leads');
    await page.getByRole('button', { name: '打开菜单' }).click();

    const nav = page.getByRole('navigation');
    await expect(nav.getByText('我的客资')).toBeVisible();
    await expect(nav.getByText('订单跟进')).toBeVisible();
    // Sales should NOT see operation-only items
    await expect(nav.getByText('作品广场')).not.toBeVisible();
  });

  test('drawer contains menu items matching the academic role', async ({ page }) => {
    await setupAuthAndGo(page, 'academic', '/academic/orders');
    await page.getByRole('button', { name: '打开菜单' }).click();

    const nav = page.getByRole('navigation');
    await expect(nav.getByText('订单池')).toBeVisible();
    await expect(nav.getByText('稳定老师库')).toBeVisible();
  });

  test('tapping a menu item navigates to the correct page', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    await page.getByRole('button', { name: '打开菜单' }).click();

    const galleryLink = page.getByRole('navigation').getByRole('link', { name: '作品广场' });
    await Promise.all([
      page.waitForURL('**/operation/gallery', { timeout: 15_000 }),
      galleryLink.click(),
    ]);
    await expect(page).toHaveURL(/\/operation\/gallery/);
  });

  test('drawer closes after selecting a navigation item', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    await page.getByRole('button', { name: '打开菜单' }).click();

    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();

    await nav.getByRole('link', { name: '客资看板' }).click();
    await page.waitForURL('**/operation/leads', { timeout: 15_000 });

    // After mobile navigation the drawer should auto-close
    await expect(nav).not.toBeVisible();
  });

  test('drawer can be closed via the close button', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    await page.getByRole('button', { name: '打开菜单' }).click();
    await expect(page.getByRole('navigation')).toBeVisible();

    await page.getByRole('button', { name: '关闭菜单' }).click();
    await expect(page.getByRole('navigation')).not.toBeVisible();
  });

  test('sidebar element is not rendered on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    // The desktop .app-sider should not exist in the DOM on mobile
    await expect(page.locator('.app-sider')).not.toBeAttached();
  });

  test('user menu button is accessible on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    const userBtn = page.getByRole('button', { name: '用户菜单' });
    await expect(userBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Desktop tests (1280x720 viewport)
// ---------------------------------------------------------------------------

test.describe('Desktop navigation (1280x720)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('sidebar is visible on desktop', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    const sider = page.locator('.app-sider');
    await expect(sider).toBeAttached();
    await expect(sider).toBeVisible();
  });

  test('hamburger button is hidden on desktop', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    await expect(page.getByRole('button', { name: '打开菜单' })).not.toBeVisible();
  });

  test('sidebar contains links for Next.js prefetching', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    const sider = page.locator('.app-sider');
    await expect(sider.getByRole('link', { name: '作品广场' })).toBeVisible();
    await expect(sider.getByRole('link', { name: '客资看板' })).toBeVisible();
  });

  test('sidebar menu items use Link elements with correct hrefs', async ({ page }) => {
    await setupAuthAndGo(page, 'operation', '/operation/posts');
    const sider = page.locator('.app-sider');
    await expect(sider.locator('a[href="/operation/gallery"]')).toHaveCount(1);
    await expect(sider.locator('a[href="/operation/leads"]')).toHaveCount(1);
    await expect(sider.locator('a[href="/operation/posts"]')).toHaveCount(1);
  });
});
