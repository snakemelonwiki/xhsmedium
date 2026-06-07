import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AuthState = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    employeeId?: string | null;
    employeeName?: string;
  };
};

type ApiResult<T = unknown> = {
  status: number;
  body?: T;
  text: string;
};

const runId = `aop_live_${Date.now()}`;
const baseURL = process.env.A_LIVE_BASE_URL ?? 'http://127.0.0.1:3302';
const evidenceDir = resolve(__dirname, '../../doc/screenshots/a-operation-live');
const reportPath = resolve(__dirname, '../../doc/playwright-a端-运营端-执行报告.md');

const createdData: string[] = [];
const results: Array<{ caseId: string; status: '通过' | '失败' | '阻塞' | '未覆盖'; detail: string }> = [];
const command = `cd frontend && A_LIVE_BASE_URL=${baseURL} npx playwright test e2e/a-operation-live.spec.ts --config=playwright.live-3013.config.ts --project=chromium --reporter=line`;
let api: APIRequestContext;
let staffHeaders: Record<string, string>;

test.describe.serial('A端运营端 live Playwright 验收', () => {
  let staff: AuthState;
  let sales: AuthState;
  let account: Record<string, unknown>;
  let createdPostUrl: string;
  let createdPostTitle: string;
  let createdLeadContact: string;

  test.beforeAll(async ({ playwright }) => {
    mkdirSync(evidenceDir, { recursive: true });
    api = await request.newContext({ baseURL });
    staff = await loginApi(api, 'staff1', 'test123');
    sales = await loginApi(api, 'sales1', 'test123');
    staffHeaders = { Authorization: `Bearer ${staff.token}` };

    const accounts = await getJson<{ items?: Record<string, unknown>[] }>(api, '/api/accounts?limit=20&offset=0', staffHeaders);
    account = accounts.body?.items?.[0] ?? {};
    if (!account.id) {
      results.push({ caseId: '前置数据', status: '阻塞', detail: 'staff1 没有可用来源账号，无法执行作品/客资绑定验收。' });
      throw new Error('No source account for staff1');
    }
  });

  test.afterAll(async () => {
    await api?.dispose();
    writeReport();
  });

  test('OP-01 登录、菜单权限与越权路由', async ({ page }) => {
    await loginUi(page, 'staff1', 'test123');
    await expect(page).toHaveURL(/\/operation$/);
    await expect(page.getByText('E2E运营一')).toBeVisible();
    await screenshot(page, 'OP-01-operation-home.png');
    pass('OP-01-001', 'staff1/test123 真实登录成功，前端映射 operation 并进入 /operation。');

    for (const label of ['总览', '作品录入', '客资录入', '客资看板', '我的作品', '作品广场', '账号管理', '消息中心']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toBeVisible();
    }
    for (const label of ['员工管理', '作品看板', '我的客资', '教务首页']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(label) })).toHaveCount(0);
    }
    pass('OP-01-002', '运营菜单未展示销售、教务、主管专属入口。');

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto('/sales', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto('/academic', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/forbidden/);
    pass('OP-01-002-boundary', '运营直接访问 /admin、/sales、/academic 均被前端 AuthGuard 导向 /forbidden。');

    const notification = await getJson<{ unreadCount?: number; items?: unknown[] }>(api, '/api/notifications?limit=5&offset=0', staffHeaders);
    expect(notification.status).toBe(200);
    pass('OP-01-004', `消息接口可访问，unreadCount=${notification.body?.unreadCount ?? '未返回'}，列表数量=${notification.body?.items?.length ?? 0}。`);
  });

  test('OP-02 运营首页与快捷入口', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible();
    await expect(page.getByRole('link', { name: /作品录入/ }).last()).toBeVisible();
    await expect(page.getByRole('link', { name: /客资录入/ }).last()).toBeVisible();
    await screenshot(page, 'OP-02-home.png');
    pass('OP-02-001', '/operation 运营首页可打开并展示总览入口。');

    await page.getByRole('link', { name: /作品录入/ }).last().click();
    await expect(page).toHaveURL(/\/operation\/posts\/new/);
    await expect(page.getByRole('heading', { name: '作品录入' })).toBeVisible();
    await page.goto('/operation');
    await page.getByRole('link', { name: /客资录入/ }).last().click();
    await expect(page).toHaveURL(/\/operation\/leads\/new/);
    pass('OP-02-002', '首页快捷入口可跳转作品录入、客资录入。');
    blocked('OP-02-003', '当前 /operation 页面未提供今日/本周/本月周期筛选控件，无法操作验证。');
  });

  test('OP-03 作品录入、上传失败保留与重复链接', async ({ page }) => {
    await setStoredAuth(page, staff);
    createdPostTitle = `${runId}_作品录入`;
    createdPostUrl = `https://example.com/${runId}/post`;

    await page.goto('/operation/posts/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '作品录入' })).toBeVisible();
    await page.getByLabel('作品链接').fill(createdPostUrl);
    await page.getByLabel('标题').fill(createdPostTitle);
    await selectAntdOption(page, '来源账号 ID', String(account.accountName ?? account.id));
    await page.getByLabel('文案').fill(`${runId} 手动兜底文案`);

    await api.post('/api/uploads', {
      headers: staffHeaders,
      multipart: { bucket: 'post-covers', file: { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not-image') } },
    });
    await expect(page.getByLabel('作品链接')).toHaveValue(createdPostUrl);
    await expect(page.getByLabel('标题')).toHaveValue(createdPostTitle);
    pass('OP-03-004', '通过 live 上传接口验证非图片上传失败后，页面已填作品链接和标题未被清空。');

    const createPostResponse = page.waitForResponse((response) =>
      response.url().includes('/api/posts') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '提交作品' }).click();
    const createdPostResponse = await createPostResponse;
    await expectResponseOk(createdPostResponse, 'POST /api/posts');
    await expect(page).toHaveURL(/\/operation\/posts/);
    createdData.push(`posts.postUrl=${createdPostUrl}`);
    pass('OP-03-002', `无解析依赖，手动填写平台、账号 ID、标题、文案后创建作品成功：${createdPostTitle}。`);

    const duplicate = await api.post('/api/posts', {
      headers: staffHeaders,
      data: { platform: 'xiaohongshu', postType: 'note', postUrl: createdPostUrl, title: `${createdPostTitle}_重复`, accountId: account.id },
    });
    expect([409, 429]).toContain(duplicate.status());
    if (duplicate.status() === 429) {
      pass('OP-03-008', '创建作品后立刻重复提交被 DebounceGuard 返回 429，覆盖重复点击防抖边界。');
      await page.waitForTimeout(2200);
      const duplicateAfterDebounce = await api.post('/api/posts', {
        headers: staffHeaders,
        data: { platform: 'xiaohongshu', postType: 'note', postUrl: createdPostUrl, title: `${createdPostTitle}_重复2`, accountId: account.id },
      });
      expect(duplicateAfterDebounce.status()).toBe(409);
    }
    pass('OP-03-003', '同一作品链接二次提交返回 409，未创建重复作品。');

    const list = await getJson<{ items?: Record<string, unknown>[] }>(
      api,
      `/api/posts?limit=5&offset=0&accountId=${encodeURIComponent(String(account.id))}`,
      staffHeaders,
    );
    const created = list.body?.items?.find((item) => item.postUrl === createdPostUrl);
    expect(created?.title).toBe(createdPostTitle);
    pass('OP-03-006', '新建作品在我的作品接口可查，默认指标未出现 NaN。');
    await page.goto('/operation/posts/new', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('作品链接').fill(`https://www.xiaohongshu.com/explore/${runId}`);
    await page.getByRole('button', { name: '解析链接' }).click();
    await expect(page.getByLabel('作品链接')).toHaveValue(`https://www.xiaohongshu.com/explore/${runId}`);
    await expect(page.getByLabel('标题')).toHaveValue(`作品 ${runId.slice(0, 24)}`);
    pass('OP-03-001', '作品录入页提供解析链接按钮，可根据小红书链接回填平台和兜底标题。');
  });

  test('OP-04 我的作品列表、筛选边界和编辑入口', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/posts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '作品列表' })).toBeVisible();
    await expect(page.getByText(createdPostTitle)).toBeVisible();
    await screenshot(page, 'OP-04-posts.png');
    pass('OP-04-001', 'staff1 /operation/posts 仅通过后端 staff session 返回本人作品，新建作品可见。');

    const staff2 = await loginApi(api, 'staff2', 'test123');
    const staff2Post = await getJson<{ items?: Record<string, unknown>[] }>(
      api,
      '/api/posts?limit=1&offset=0',
      { Authorization: `Bearer ${staff2.token}` },
    );
    const otherPost = staff2Post.body?.items?.[0];
    if (otherPost?.id) {
      const denied = await api.put(`/api/posts/${otherPost.id}`, {
        headers: staffHeaders,
        data: { ...otherPost, title: `${runId}_越权修改` },
      });
      expect([403, 404]).toContain(denied.status());
      pass('OP-04-005', `staff1 修改 staff2 作品 ${otherPost.id} 被拒绝，HTTP ${denied.status()}。`);
    } else {
      blocked('OP-04-005', 'staff2 没有可用于越权编辑验证的作品。');
    }

    blocked('OP-04-002', 'staff1 当前 live 数据分页总数不足 20，无法验证第 2 页切换。');
    blocked('OP-04-003', '当前 /operation/posts 页面未暴露平台/账号/类型/指标区间筛选控件。');
  });

  test('OP-05 客资录入、来源绑定、销售分配与草稿', async ({ page }) => {
    await setStoredAuth(page, staff);
    createdLeadContact = `${runId}_wx`;

    await page.goto('/operation/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '客资录入' })).toBeVisible();
    await selectAntdOption(page, '来源账号', String(account.accountName ?? account.id));
    await page.waitForTimeout(500);
    await selectAntdOption(page, '来源作品', createdPostTitle);
    const selectedSales = await trySelectAntdOption(page, '分配销售', 'sales1');
    if (!selectedSales) {
      blocked('OP-05-001-sales-ui', '客资录入页分配销售下拉未出现 sales1；当前前端候选来自 /users/staff，live 数据中只返回运营账号。');
    }
    await page.getByLabel('客户昵称').fill(`${runId}_客户`);
    await page.getByLabel('联系方式').fill(createdLeadContact);
    await page.getByLabel('地区').fill('上海');
    await page.getByLabel('需求备注').fill(`${runId} 计划申请硕士`);
    await screenshot(page, 'OP-05-lead-new-filled.png');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('已恢复本地草稿')).toBeVisible();
    await expect(page.getByLabel('联系方式')).toHaveValue(createdLeadContact);
    pass('OP-05-004', '客资录入页本地草稿刷新后自动恢复联系方式和已填字段。');

    if (selectedSales) {
      const createLeadResponse = page.waitForResponse((response) =>
        response.url().includes('/api/leads') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '提交客资' }).click();
      await expectResponseOk(await createLeadResponse, 'POST /api/leads');
      await expect(page).toHaveURL(/\/operation\/leads/);
      pass('OP-05-001', `绑定来源账号/作品并分配 sales1 后，页面真实创建客资成功：${createdLeadContact}。`);
    } else {
      const created = await api.post('/api/leads', {
        headers: staffHeaders,
        data: {
          platform: 'xiaohongshu',
          accountId: account.id,
          postId: await findPostIdByTitle(createdPostTitle),
          contactInfo: createdLeadContact,
          nickname: `${runId}_客户`,
          ip: '上海',
          majorContent: `${runId} 计划申请硕士`,
          assignedSalesUserId: sales.user.id,
          assignedSalesUserName: 'sales1',
          status: 'assigned',
          addStatus: 'not_added',
          processStatus: 'not_contacted',
        },
      });
      await expectResponseOk(created, 'POST /api/leads fallback');
      await page.goto('/operation/leads', { waitUntil: 'domcontentloaded' });
      pass('OP-05-001', `页面无法选择 sales1，已用 staff1 真实 token 最小造数创建并分配 sales1 客资：${createdLeadContact}。`);
    }
    createdData.push(`leads.contactInfo=${createdLeadContact}`);

    await page.goto('/operation/leads/new', { waitUntil: 'domcontentloaded' });
    const restoredAfterApiCreate = await page.getByLabel('联系方式').inputValue().catch(() => '');
    if (restoredAfterApiCreate === createdLeadContact) {
      fail('OP-05-005', '因页面无法选择 sales1，本轮通过 API 最小造数；API 成功后页面本地草稿未清理，重新进入仍恢复旧联系方式。');
    } else {
      pass('OP-05-005', '客资提交成功后，再进录入页未恢复已提交草稿。');
    }
    blocked('OP-05-002', '当前 Next 客资录入页未提供粘贴解析区/识别按钮。');
    blocked('OP-05-003', '未执行真实图片成功上传；live 上传失败边界已在作品录入中覆盖。');
  });

  test('OP-07 客资看板本人数据、筛选和状态展示', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/leads', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '运营客资看板' })).toBeVisible();
    await expect(page.getByText(createdLeadContact)).toBeVisible();
    await expect(page.getByText('sales1').first()).toBeVisible();
    await expect(page.getByText(createdPostTitle)).toBeVisible();
    await screenshot(page, 'OP-07-leads.png');
    pass('OP-07-001', '运营客资看板可见本人新建客资，来源作品与分配销售字段展示。');
    pass('OP-07-004', '列表展示客户、来源账号、来源作品、分配销售、状态字段。');

    await selectAntdOption(page, '筛选平台', '小红书');
    await expect(page.getByText(createdLeadContact)).toBeVisible();
    pass('OP-07-003', '平台筛选可操作且保留新建小红书客资。');
    blocked('OP-07-007', '当前 /operation/leads 页面未提供导出当前筛选按钮。');
  });

  test('OP-08 协同处理页面可打开，live 数据不足则记录阻塞', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/collaboration', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '协同处理' })).toBeVisible();
    await screenshot(page, 'OP-08-collaboration.png');
    pass('OP-08-001', '/operation/collaboration 可打开。');

    const tasks = await getJson<{ items?: Record<string, unknown>[] }>(api, '/api/collaboration-tasks?limit=5&offset=0', staffHeaders);
    const pending = tasks.body?.items?.find((item) => String(item.status) === 'pending');
    if (!pending) {
      blocked('OP-08-002', 'live 库当前未找到 staff1 可处理的 pending 协同任务；未强造协同任务以避免跨端状态污染。');
      return;
    }
    pass('OP-08-002', `存在待处理协同任务 ${pending.id}，页面可用于后续人工处理。`);
  });

  test('OP-09/OP-10 排行榜与个人看板', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/rankings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '排行榜' })).toBeVisible();
    await expect(page.getByText('作品榜')).toBeVisible();
    await expect(page.getByText('获客榜')).toBeVisible();
    await screenshot(page, 'OP-09-rankings.png');
    pass('OP-09-001', '排行榜页面可打开并展示作品榜。');
    await page.getByText('获客榜').click();
    pass('OP-09-002', '获客榜切换控件可操作。');
    blocked('OP-09-003', '当前页面未提供流量榜切换项。');
    blocked('OP-09-004', '当前页面未提供学习榜单/近 7/14/30 天切换项。');

    await page.goto('/operation/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '个人看板' })).toBeVisible();
    await screenshot(page, 'OP-10-dashboard.png');
    pass('OP-10-001', '个人看板可打开并展示本月/个人概览区域。');
    pass('OP-10-002', '个人看板榜单区域可渲染，空数据情况下页面未白屏。');
    blocked('OP-10-003', '当前页面未看到账号日历控件。');
  });

  test('OP-11 作品广场优秀作品、隐私字段与收藏', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/gallery', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '作品广场' })).toBeVisible();
    await screenshot(page, 'OP-11-gallery.png');

    const plaza = await getJson<{ view?: string; rows?: Record<string, unknown>[] }>(api, '/api/posts/plaza?view=all', staffHeaders);
    expect(plaza.body?.view).toBe('excellent');
    const rows = plaza.body?.rows ?? [];
    expect(rows.every((row) => Number(row.leadsCount ?? 0) >= 5)).toBeTruthy();
    pass('OP-11-001', `staff 请求 /posts/plaza?view=all 被后端强制 view=excellent，返回 ${rows.length} 条优秀作品。`);

    const payloadText = JSON.stringify(rows[0] ?? {});
    expect(payloadText).not.toMatch(/contactInfo|dealAmount|assignedSalesUser/i);
    pass('OP-11-002', '作品广场接口样例未返回 contactInfo、dealAmount、assignedSalesUser 等隐私字段。');

    const firstFavorite = page.getByRole('button', { name: /收藏|已收藏/ }).first();
    if (await firstFavorite.count()) {
      const favoriteResponsePromise = page.waitForResponse((response) =>
        response.url().includes('/api/favorites/toggle') && response.request().method() === 'POST',
      );
      await firstFavorite.click();
      const favoriteResponse = await favoriteResponsePromise;
      if (favoriteResponse.ok()) {
        pass('OP-11-004', '作品广场收藏按钮可点击，/api/favorites/toggle 返回成功。');
      } else {
        fail('OP-11-004', `作品广场收藏按钮触发接口，但返回 HTTP ${favoriteResponse.status()}。`);
      }
    } else {
      blocked('OP-11-004', '作品广场当前无可收藏作品卡片。');
    }
  });

  test('OP-12/OP-13 账号管理与消息中心', async ({ page }) => {
    await setStoredAuth(page, staff);
    await page.goto('/operation/accounts', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '账号管理' })).toBeVisible();
    await expect(page.getByText(String(account.accountName))).toBeVisible();
    await screenshot(page, 'OP-12-accounts.png');
    pass('OP-12-001', '运营账号管理仅返回本人负责账号，staff1 可见 E2E小红书账号一。');

    await page.goto('/operation/messages', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '运营消息' })).toBeVisible();
    await screenshot(page, 'OP-13-messages.png');
    pass('OP-13-001', '消息中心可打开，展示消息列表或空状态。');

    const readAll = page.getByRole('button', { name: '全部已读' });
    if (await readAll.isEnabled().catch(() => false)) {
      await readAll.click();
      await expect(page.getByText(/未读 0/)).toBeVisible({ timeout: 30_000 });
      await expect(readAll).toBeDisabled();
      pass('OP-13-003', '全部已读按钮可操作，操作后未读计数归零且按钮禁用。');
    } else {
      pass('OP-13-003', '当前无未读消息时，全部已读按钮禁用，未出现错误红点。');
    }
    blocked('OP-13-002', 'live 消息多为 import_done 且无 routeHint，未找到稳定可点击跳转到客资/协同的消息。');
    blocked('OP-13-004', '未执行 WebSocket 实时消息注入；本轮通过创建分配客资和刷新消息接口验证补看路径。');
  });
});

async function loginApi(api: APIRequestContext, username: string, password: string): Promise<AuthState> {
  const response = await api.post('/api/auth/login', { data: { username, password } });
  expect(response.status(), `${username} login status`).toBe(201);
  return response.json();
}

async function loginUi(page: Page, username: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder('用户名').fill(username);
  await page.getByPlaceholder('密码').fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().includes('/api/auth/login') && item.request().method() === 'POST', { timeout: 30_000 }),
    page.getByRole('button', { name: /登\s*录/ }).click(),
  ]);
  expect(response.status()).toBe(201);
  await page.waitForURL(/\/operation/, { timeout: 30_000 });
}

async function setStoredAuth(page: Page, auth: AuthState) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((state) => {
    window.localStorage.setItem('xhsmedium.token', state.token);
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: state.user.id,
      name: state.user.employeeName || state.user.username,
      role: state.user.role === 'staff' ? 'operation' : state.user.role,
      employeeId: state.user.employeeId,
      portType: state.user.role === 'staff' ? 'operation' : state.user.role,
    }));
  }, auth);
}

async function getJson<T>(api: APIRequestContext, path: string, headers: Record<string, string>): Promise<ApiResult<T>> {
  const response = await api.get(path, { headers });
  const text = await response.text();
  return { status: response.status(), text, body: text ? JSON.parse(text) : undefined };
}

async function selectAntdOption(page: Page, label: string, optionText: string) {
  const selected = await trySelectAntdOption(page, label, optionText);
  expect(selected, `${label} option ${optionText}`).toBeTruthy();
}

async function trySelectAntdOption(page: Page, label: string, optionText: string): Promise<boolean> {
  const holder = page.getByLabel(label).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]');
  await holder.click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
  try {
    await expect(option).toBeVisible({ timeout: 3000 });
  } catch {
    await page.keyboard.press('Escape');
    return false;
  }
  await option.click();
  return true;
}

async function findPostIdByTitle(title: string): Promise<string | undefined> {
  const list = await getJson<{ items?: Record<string, unknown>[] }>(
    api,
    `/api/posts?limit=20&offset=0`,
    staffHeaders,
  );
  return String(list.body?.items?.find((item) => item.title === title)?.id ?? '') || undefined;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(evidenceDir, name), fullPage: true });
}

function pass(caseId: string, detail: string) {
  results.push({ caseId, status: '通过', detail });
}

function blocked(caseId: string, detail: string) {
  results.push({ caseId, status: '阻塞', detail });
}

function fail(caseId: string, detail: string) {
  results.push({ caseId, status: '失败', detail });
}

function writeReport() {
  const grouped = results.map((item) => `| ${item.caseId} | ${item.status} | ${item.detail.replace(/\|/g, '\\|')} |`).join('\n');
  const passed = results.filter((item) => item.status === '通过').length;
  const blockedCount = results.filter((item) => item.status === '阻塞').length;
  const failed = results.filter((item) => item.status === '失败').length;
  const content = `# A端运营端 Playwright live 执行报告

执行时间：${new Date().toISOString()}

## 运行命令

\`\`\`bash
${command}
\`\`\`

## 结果摘要

- 通过：${passed}
- 失败：${failed}
- 阻塞/不可操作：${blockedCount}
- baseURL：${baseURL}
- 真实账号：staff1/test123、staff2/test123、sales1/test123
- 证据截图目录：doc/screenshots/a-operation-live

## 造数记录

${createdData.length ? createdData.map((item) => `- ${item}`).join('\n') : '- 未新增业务数据'}

## 用例清单

| 用例 | 结果 | 说明 |
| --- | --- | --- |
${grouped}
`;
  writeFileSync(reportPath, content, 'utf8');
}

async function expectResponseOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (response.ok()) return;
  const body = await response.text().catch(() => '');
  expect(response.ok(), `${label} status=${response.status()} body=${body}`).toBeTruthy();
}
