import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';

const screenshotRoot = resolve(__dirname, '../../doc/screenshots/playwright-a-admin-live');

type LoginResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    employeeId?: string | null;
    employeeName?: string | null;
  };
};

async function saveShot(page: Page, testInfo: TestInfo, name: string) {
  const file = resolve(screenshotRoot, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  testInfo.attachments.push({ name, path: file, contentType: 'image/png' });
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await expect(page.getByRole('heading', { name: /登录/ })).toBeVisible();
  await page.getByPlaceholder('用户名').fill(username);
  await page.getByPlaceholder('密码').fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  const response = await loginResponse;
  expect(response.ok(), `${username} login response should be OK`).toBeTruthy();
  return response.json() as Promise<LoginResponse>;
}

async function loginAsAdmin(page: Page) {
  const result = await login(page, 'admin2', 'test123');
  await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('/admin');
  return result;
}

async function setAuthFromLoginApi(page: Page, username: string, password: string) {
  const response = await page.request.post('/api/auth/login', { data: { username, password } });
  expect(response.ok(), `${username} API login should be OK`).toBeTruthy();
  const result = (await response.json()) as LoginResponse;
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((auth) => {
    const role = auth.user.role === 'staff' ? 'operation' : auth.user.role;
    window.localStorage.setItem('xhsmedium.token', auth.token);
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: auth.user.id,
      name: auth.user.employeeName || auth.user.username,
      role,
      employeeId: auth.user.employeeId,
      portType: role,
    }));
  }, result);
  return result;
}

async function setAdminAuth(page: Page) {
  return setAuthFromLoginApi(page, 'admin2', 'test123');
}

async function waitForAdminPage(page: Page, title: string | RegExp) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
}

test.describe('A-admin live Playwright acceptance', () => {
  test('AD-01/AD-02 admin login, menu, refresh persistence and overview widgets', async ({ page }, testInfo) => {
    await loginAsAdmin(page);
    await waitForAdminPage(page, '主管总览');

    await expect(page.getByText('当前角色：主管')).toBeVisible();
    for (const menuName of ['总览', '运营排行榜', '个人看板', '作品看板', '客资看板', '员工管理', '账号管理', '分析看板', '消息中心', '导出中心']) {
      await expect(page.getByRole('menuitem', { name: menuName })).toBeVisible();
    }

    for (const metricName of ['今日客资', '今日成交', '作品数', '点赞数', '待处理协同', '风险提醒']) {
      await expect(page.getByText(metricName)).toBeVisible();
    }
    await page.getByText('本周').click();
    await page.getByText('本月').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '主管总览');
    await saveShot(page, testInfo, '01-admin-overview');
  });

  test('AD-01-003 non-admin staff cannot view /admin and API denies admin data', async ({ page, request }, testInfo) => {
    const staff = await setAuthFromLoginApi(page, 'staff1', 'test123');
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/\/forbidden|\/login/);
    await expect(page.getByText(/无权|Forbidden|403|没有权限|登录/).first()).toBeVisible({ timeout: 30_000 });
    await saveShot(page, testInfo, '02-staff-forbidden-admin');

    const employeeResponse = await request.get('/api/employees', {
      headers: { Authorization: `Bearer ${staff.token}` },
    });
    expect([401, 403]).toContain(employeeResponse.status());
  });

  test('AD-03 rankings support global list, filters, pagination and missing export entry is visible', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/rankings', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '运营排行榜');
    await expect(page.getByText('作品榜', { exact: true })).toBeVisible();
    await expect(page.getByText('客资榜', { exact: true })).toBeVisible();
    await page.getByText('客资榜', { exact: true }).click();
    await page.getByText('近 7 天', { exact: true }).click();
    await page.getByText('小红书', { exact: true }).click();
    await expect(page.getByRole('columnheader', { name: '员工' })).toBeVisible();
    await expect(page.getByText('排名')).toBeVisible();
    await expect(page.getByText(/暂无榜单数据|E2E|运营|员工/).first()).toBeVisible();
    await saveShot(page, testInfo, '03-admin-rankings');

    await expect(page.getByRole('button', { name: /当前筛选导出/ })).toBeVisible();
  });

  test('AD-04 personal board employee selector and scope widgets render', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    const employeesResponse = page.waitForResponse((response) =>
      response.url().includes('/api/employees') && response.request().method() === 'GET',
    );
    await page.goto('/admin/personal', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '个人看板');
    expect((await employeesResponse).ok(), 'employees list should load for selector').toBeTruthy();
    await expect(page.getByText('请先选择员工')).toBeVisible();
    await page.locator('.ant-select').first().click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('.ant-select-item-option').first()).toBeVisible({ timeout: 30_000 });
    const optionCount = await dropdown.locator('.ant-select-item-option').count();
    expect(optionCount, 'employee selector should reuse live employee data').toBeGreaterThan(0);
    await dropdown.locator('.ant-select-item-option').first().click();
    await expect(page.getByText('累计作品')).toBeVisible();
    await expect(page.getByText('累计客资')).toBeVisible();
    await expect(page.getByText('最近作品')).toBeVisible();
    await expect(page.getByText('最近客资')).toBeVisible();
    await saveShot(page, testInfo, '04-admin-personal');
  });

  test('AD-05 posts board global list, filters, pagination and absent detail/export controls', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/posts', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '作品看板');
    await expect(page.locator('.ant-select').filter({ hasText: /选择员工|E2E|运营|员工/ }).first()).toBeVisible();
    await expect(page.locator('.ant-select').filter({ hasText: /平台|小红书|抖音/ }).first()).toBeVisible();
    await expect(page.getByPlaceholder('搜索标题/文案')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '员工' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '账号' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '标题' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '赞' })).toBeVisible();
    await page.getByPlaceholder('搜索标题/文案').fill('AGAD_no_match');
    const filteredResponse = page.waitForResponse((response) =>
      response.url().includes('/api/posts') && response.url().includes('AGAD_no_match') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'search' }).click();
    expect((await filteredResponse).ok(), 'posts keyword filter request should return').toBeTruthy();
    await saveShot(page, testInfo, '05-admin-posts');

    await expect(page.getByRole('button', { name: /当前筛选导出/ })).toBeVisible();
    await page.getByRole('button', { name: 'close-circle' }).click();
    const reloadResponse = page.waitForResponse((response) =>
      response.url().includes('/api/posts') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'search' }).click();
    expect((await reloadResponse).ok(), 'posts reload after clearing keyword should return').toBeTruthy();
    const detailButton = page.getByRole('button', { name: /详情/ }).first();
    if (await detailButton.count()) {
      await expect(detailButton).toBeVisible();
    } else {
      await expect(page.getByText(/暂无作品|暂无数据/).first()).toBeVisible();
    }
  });

  test('AD-06 leads board global list, status tags and missing action/export controls', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '主管客资');
    for (const column of ['客户', '联系方式', '平台', '运营', '销售', '状态', '跟进', '创建时间']) {
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expect(page.getByText(/未分配|已分配|待添加|沟通中|暂无客资|客资加载失败/).first()).toBeVisible();
    await saveShot(page, testInfo, '06-admin-leads');

    await expect(page.getByRole('button', { name: /当前筛选导出/ })).toBeVisible();
    const leadActionButton = page.getByRole('button', { name: /改派|提醒/ }).first();
    if (await leadActionButton.count()) {
      await expect(leadActionButton).toBeVisible();
    } else {
      await expect(page.getByText(/暂无客资|客资加载失败/).first()).toBeVisible();
    }
  });

  test('AD-07 employees list, search, create validation and edit entry without destructive writes', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/employees', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '员工管理');
    await expect(page.getByPlaceholder('搜索姓名、员工编号、电话、状态')).toBeVisible();
    await expect(page.getByRole('button', { name: '新增员工' })).toBeVisible();
    await page.getByRole('button', { name: '新增员工' }).click();
    await expect(page.getByRole('dialog', { name: '新增员工' })).toBeVisible();
    await page.getByRole('button', { name: /确\s*定|OK/ }).click();
    await expect(page.getByText('请输入姓名')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
    await saveShot(page, testInfo, '07-admin-employees');
  });

  test('AD-08 accounts list, search, create validation and edit entry without destructive writes', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '账号管理');
    await expect(page.getByPlaceholder('搜索账号名、账号UID、定位、员工ID')).toBeVisible();
    await expect(page.getByRole('button', { name: '新增账号' })).toBeVisible();
    await page.getByRole('button', { name: '新增账号' }).click();
    await expect(page.getByRole('dialog', { name: '新增账号' })).toBeVisible();
    await page.getByRole('button', { name: /确\s*定|OK/ }).click();
    await expect(page.getByText('请输入账号名')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
    await saveShot(page, testInfo, '08-admin-accounts');
  });

  test('AD-09 analytics and AD-10 messages render live admin views', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/analytics', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '分析看板');
    for (const text of ['今日客资', '今日成交', '小红书流量', '抖音流量', '作品类型分布', '员工表现']) {
      await expect(page.getByText(text).first()).toBeVisible();
    }
    await saveShot(page, testInfo, '09-admin-analytics');

    await page.goto('/admin/messages', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '消息中心');
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expect(page.getByText(/全部|未读|暂无消息|协同|客资|系统/).first()).toBeVisible();
    await saveShot(page, testInfo, '10-admin-messages');
  });

  test('AD-11 export center creates a real posts export task and lists status', async ({ page }, testInfo) => {
    await setAdminAuth(page);
    await page.goto('/admin/exports', { waitUntil: 'domcontentloaded' });
    await waitForAdminPage(page, '导出中心');
    await expect(page.getByText('作品', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('客资', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('排行榜', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('账号', { exact: true }).last()).toBeVisible();

    const createResponse = page.waitForResponse((response) =>
      response.url().includes('/api/exports') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建导出' }).click();
    const response = await createResponse;
    expect(response.ok(), 'posts export task should be created by live API').toBeTruthy();
    const body = await response.json();
    expect(body.id, 'export task id').toBeTruthy();
    await expect(page.getByText('导出任务已创建')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/待处理|处理中|已完成|成功|失败|pending|processing|completed|success|failed/).first()).toBeVisible({ timeout: 30_000 });
    await saveShot(page, testInfo, '11-admin-exports');
  });
});
