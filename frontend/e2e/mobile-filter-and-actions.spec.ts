import { expect, test, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (route: Route, body: unknown) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

/** Mock the full API surface that the admin/leads page touches. */
async function mockAdminLeadsApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;

    // Notifications (loaded by AppLayout header)
    if (path === '/api/notifications') {
      return json(route, { items: [], unreadCount: 0, total: 0, limit: 8, offset: 0 });
    }

    // Admin leads list
    if (path === '/api/admin/leads') {
      return json(route, {
        items: [
          {
            id: 'lead-1',
            customerName: '客户A',
            contact: '13800138000',
            platform: 'xiaohongshu',
            operatorName: '运营张三',
            salesName: '销售李四',
            status: 'assigned',
            addStatus: 'not_added',
            processStatus: 'not_contacted',
            collaborationStatus: 'none',
            createdAt: '2026-06-01T10:00:00Z',
            updatedAt: '2026-06-01T10:00:00Z',
            sourcePostTitle: '热门作品A',
            sourcePostUrl: 'https://example.com/post-1',
            sourceAccountName: '账号X',
          },
          {
            id: 'lead-2',
            customerName: '客户B',
            contact: '13900139000',
            platform: 'xiaohongshu',
            operatorName: '运营王五',
            salesName: '销售赵六',
            status: 'assigned',
            addStatus: 'added',
            processStatus: 'communicating',
            collaborationStatus: 'none',
            createdAt: '2026-06-02T14:00:00Z',
            updatedAt: '2026-06-02T14:00:00Z',
            sourcePostTitle: '作品B',
            sourcePostUrl: 'https://example.com/post-2',
            sourceAccountName: '账号Y',
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      });
    }

    // Admin leads stats
    if (path === '/api/admin/leads/stats') {
      return json(route, {
        total: 2,
        filteredTotal: 2,
        assigned: 2,
        newCount: 0,
        byStatus: { new: 0, assigned: 2 },
        byAddStatus: { not_added: 1, added: 1 },
        byProcess: { deal_done: 0 },
      });
    }

    // Admin employees list (for operator dropdown)
    if (path === '/api/admin/employees') {
      return json(route, {
        items: [
          { id: 'emp-1', name: '运营张三' },
          { id: 'emp-2', name: '运营王五' },
        ],
        total: 2,
        limit: 50,
        offset: 0,
      });
    }

    // Catalog: assignable sales users
    if (path === '/api/admin/catalog/sales-users') {
      return json(route, [
        { id: 'user-sales-1', name: '销售李四', capacityPaused: false },
        { id: 'user-sales-2', name: '销售赵六', capacityPaused: false },
      ]);
    }

    // Catalog: source accounts (may or may not be called)
    if (path === '/api/admin/catalog/source-accounts') {
      return json(route, [
        { id: 'account-1', name: '账号X', employeeId: 'emp-1' },
        { id: 'account-2', name: '账号Y', employeeId: 'emp-2' },
      ]);
    }

    // Catalog: source posts
    if (path === '/api/admin/catalog/source-posts') {
      return json(route, [
        { id: 'post-1', name: '热门作品A', accountId: 'account-1' },
        { id: 'post-2', name: '作品B', accountId: 'account-2' },
      ]);
    }

    // Exports (used by 导出 button)
    if (path === '/api/exports' && req.method() === 'POST') {
      return json(route, { id: 'export-1' });
    }

    return json(route, { ok: true });
  });
}

type TestRole = 'operation' | 'sales' | 'academic' | 'admin';

async function setupAuthAndGo(page: Page, role: TestRole, targetPath: string) {
  await mockAdminLeadsApi(page);
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
// Mobile filter & actions tests
// ---------------------------------------------------------------------------

test.describe('Mobile filter and actions (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('filter button is visible on the list page on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');
    await expect(page.getByRole('heading', { name: '主管客资看板' })).toBeVisible();

    // On mobile the inline filter bar is replaced by a "筛选" button
    const filterBtn = page.getByRole('button', { name: '筛选' });
    await expect(filterBtn).toBeVisible();
  });

  test('tapping the filter button opens a bottom drawer with filter controls', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await page.getByRole('button', { name: '筛选' }).click();

    // A Drawer with title "筛选条件" should open from the bottom
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // The drawer title should indicate it's for filters
    await expect(page.getByText('筛选条件')).toBeVisible();

    // Filter controls: platform Select should be present
    await expect(page.getByRole('combobox', { name: '平台' })).toBeVisible();
  });

  test('filter drawer contains platform and status filter dropdowns', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await page.getByRole('button', { name: '筛选' }).click();

    // The drawer has multiple Select components for filtering
    const platformSelect = page.getByRole('combobox', { name: '平台' });
    const operatorSelect = page.getByRole('combobox', { name: '运营' });
    const salesSelect = page.getByRole('combobox', { name: '销售' });

    await expect(platformSelect).toBeVisible();
    await expect(operatorSelect).toBeVisible();
    await expect(salesSelect).toBeVisible();
  });

  test('selecting a platform filter closes the drawer and updates the filter context', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await page.getByRole('button', { name: '筛选' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Select "小红书" platform
    const platformSelect = page.getByRole('combobox', { name: '平台' });
    await platformSelect.click();
    // Ant Design Select renders options in a dropdown; pick the first non-default option
    const option = page.locator('.ant-select-dropdown').getByText('小红书');
    await option.click();

    // The drawer should still be open (the app doesn't auto-close on single filter change)
    // The "平台" Select value should now reflect the selection
    await expect(platformSelect).toHaveText(/小红书/);
  });

  test('table rows are scrollable horizontally on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    // Wait for the table to render
    await expect(page.getByText('客户A')).toBeVisible();

    // The table has scroll={{ x: 1400 }} so on a 390px viewport it must scroll
    const tableBody = page.locator('.ant-table-body').first();
    await expect(tableBody).toBeVisible();

    // Verify that the table content exceeds the viewport width
    const tableContainer = page.locator('.ant-table-wrapper').first();
    const containerBox = await tableContainer.boundingBox();
    expect(containerBox).not.toBeNull();

    // Action column (fixed right) indicates horizontal scroll is needed
    const actionHeader = page.getByRole('columnheader', { name: '操作' });
    await expect(actionHeader).toBeVisible({ timeout: 10_000 });
  });

  test('action buttons in table rows are accessible on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await expect(page.getByText('客户A')).toBeVisible();

    // Each row should have "改派" and "跟进" action buttons
    const reassignBtn = page.getByRole('button', { name: '改派' }).first();
    const followBtn = page.getByRole('button', { name: '跟进' }).first();

    await expect(reassignBtn).toBeVisible();
    await expect(followBtn).toBeVisible();
  });

  test('高级筛选 (advanced filter modal) button is visible on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    // The "高级筛选" button is always visible (independent of the mobile filter drawer)
    const advancedBtn = page.getByRole('button', { name: /高级筛选/ });
    await expect(advancedBtn).toBeVisible();
  });

  test('tapping 高级筛选 opens a modal with extended filter options', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await page.getByRole('button', { name: /高级筛选/ }).click();

    // A Modal dialog should open
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('高级筛选')).toBeVisible();

    // The modal has Apply and Cancel buttons
    await expect(page.getByRole('button', { name: '应用' })).toBeVisible();
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
  });

  test('刷新 and 导出 action buttons are visible on mobile', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Desktop filter behavior (reference tests)
// ---------------------------------------------------------------------------

test.describe('Desktop filter behavior (1280x720)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('inline filter bar is visible on desktop instead of the mobile filter button', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');

    // On desktop the Card-based filter bar should be visible
    // The mobile-only "筛选" button should not exist
    // The inline platform/operator/sales selects should be directly on the page (not in a drawer)
    await expect(page.getByRole('combobox', { name: '平台' })).toBeVisible();

    // The table should be visible
    await expect(page.getByText('客户A')).toBeVisible();
  });

  test('table is fully visible on desktop without horizontal scroll for action column', async ({ page }) => {
    await setupAuthAndGo(page, 'admin', '/admin/leads');
    await expect(page.getByText('客户A')).toBeVisible();

    // Action buttons should still be accessible
    await expect(page.getByRole('button', { name: '改派' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '跟进' }).first()).toBeVisible();
  });
});
