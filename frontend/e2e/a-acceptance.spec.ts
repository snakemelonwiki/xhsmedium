import { expect, test, type Page, type Route } from '@playwright/test';

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockApi(page: Page) {
  const leadRows = [{
    id: 'lead-a-001',
    nickname: '王同学',
    contactInfo: 'wx-wang-2026',
    platform: 'xiaohongshu',
    sourceAccountName: '留学案例号',
    sourcePostTitle: '英国硕士申请避坑指南',
    assignedSalesUserName: '销售张明',
    employeeName: '运营王敏',
    status: 'in_collaboration',
    addStatus: 'not_passed',
    processStatus: 'communicating',
    collaborationStatus: 'pending',
    updatedAt: '2026-05-31 19:30:00',
  }];
  let uploadFailureCount = 0;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (path === '/posts' && method === 'POST') {
      return json(route, { ok: true });
    }
    if (path === '/uploads' && method === 'POST') {
      uploadFailureCount += 1;
      if (uploadFailureCount === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: '上传失败' }),
        });
      }
      return json(route, {
        ok: true,
        url: '/uploads/e2e-image.png',
        fileId: 'upload-a-001',
        fileType: 'image/png',
      });
    }
    if (path === '/posts' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'post-a-001',
          title: '今日作品',
          platform: 'xiaohongshu',
          postType: 'lead_post',
          accountName: '留学案例号',
          publishedAt: '2026-05-31',
          likes: 0,
          comments: 0,
          favorites: 0,
          traffic: 0,
        }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path === '/leads' && method === 'GET') {
      return json(route, { items: leadRows, total: 1, limit: 20, offset: 0 });
    }
    if (path === '/leads' && method === 'POST') {
      return json(route, { ok: true, id: 'lead-a-002' });
    }
    if (path === '/users/staff' && method === 'GET') {
      return json(route, {
        items: [{ id: 'sales-a-001', employeeName: '销售张明', status: 'active' }],
        total: 1,
        limit: 200,
        offset: 0,
      });
    }
    if (path === '/accounts' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'account-a-001',
          accountName: '留学案例号',
          platform: 'xiaohongshu',
          status: 'active',
        }],
        total: 1,
        limit: 200,
        offset: 0,
      });
    }
    if (path === '/collaboration-tasks' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'task-a-001',
          leadId: 'lead-a-001',
          type: 'remind_customer',
          reason: '客户未通过好友申请，请运营协助提醒。',
          requesterName: '销售张明',
          customerName: '王同学',
          contactInfo: 'wx-wang-2026',
          sourcePostTitle: '英国硕士申请避坑指南',
          salesRemark: '客户晚上在线，建议 20 点前提醒。',
          status: 'pending',
          createdAt: '2026-05-31 19:40:00',
        }],
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path === '/collaboration-tasks/task-a-001/handle' && method === 'PUT') {
      return json(route, { ok: true, task: { id: 'task-a-001', status: 'handled' } });
    }
    if (path === '/notifications' && method === 'GET') {
      return json(route, {
        items: [{
          id: 'notice-a-001',
          typeCode: 'collaboration_requested',
          title: '协同任务待处理',
          content: '王同学有新的协同请求',
          readStatus: 0,
          createdAt: '2026-05-31 19:45:00',
          relatedType: 'collaboration_task',
          relatedId: 'task-a-001',
          portType: 'operations',
        }],
        unreadCount: 1,
        total: 1,
        limit: 20,
        offset: 0,
      });
    }
    if (path.match(/^\/notifications\/[^/]+\/read$/) && method === 'POST') {
      return json(route, { ok: true, changed: true });
    }
    if (path === '/notifications/read-all' && method === 'POST') {
      return json(route, { ok: true, affected: 1 });
    }

    return json(route, { ok: true });
  });
}

async function setOperationAuth(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.localStorage.setItem('xhsmedium.token', 'a-acceptance-token');
    window.localStorage.setItem('xhsmedium.user', JSON.stringify({
      id: 'operation-a-001',
      name: '运营王敏',
      role: 'operation',
      employeeId: 'emp-operation-a',
      portType: 'operation',
    }));
  });
}

async function gotoApp(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

async function selectAntdOption(page: Page, label: string, optionName: string | RegExp) {
  await page
    .getByRole('combobox', { name: label })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
    .click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  await dropdown.getByTitle(optionName).click();
}

test('A-side operation workflow covers post record, lead board and collaboration handling', async ({ page }) => {
  await mockApi(page);
  await setOperationAuth(page);

  await gotoApp(page, '/operation/posts/new');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '作品录入' })).toBeVisible();
  await page.getByLabel('作品链接').fill('https://example.com/post-a');
  await page.getByLabel('标题').fill('今日作品');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from('e2e-image'),
  });
  await expect(page.getByLabel('作品链接')).toHaveValue('https://example.com/post-a');
  const createPostResponse = page.waitForResponse((response) =>
    response.url().includes('/api/posts') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交作品' }).click();
  await expect((await createPostResponse).ok()).toBeTruthy();
  await page.waitForURL(/\/operation\/posts\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/, { timeout: 30_000 });
  await expect(page.getByText('今日录入记录')).toBeVisible();
  await expect(page.getByText('今日作品')).toBeVisible();

  await gotoApp(page, '/operation/leads');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '运营客资看板' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '来源账号' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '来源作品' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '分配销售' })).toBeVisible();
  await expect(page.getByText('销售张明')).toBeVisible();
  await expect(page.getByText('英国硕士申请避坑指南')).toBeVisible();
  const filteredLeadsResponse = page.waitForResponse((response) =>
    response.url().includes('/api/leads') &&
    response.url().includes('platform=xiaohongshu') &&
    response.request().method() === 'GET',
  );
  await selectAntdOption(page, '筛选平台', '小红书');
  await expect((await filteredLeadsResponse).ok()).toBeTruthy();

  await gotoApp(page, '/operation/collaboration');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '协同处理' })).toBeVisible();
  const taskDetail = page.locator('.ant-card').filter({ hasText: '协同详情' });
  await expect(taskDetail.getByText('王同学')).toBeVisible();
  await expect(taskDetail.getByText('客户未通过好友申请，请运营协助提醒。')).toBeVisible();
  await expect(taskDetail.getByText('英国硕士申请避坑指南')).toBeVisible();
  await expect(taskDetail.getByText('客户晚上在线，建议 20 点前提醒。')).toBeVisible();
  await selectAntdOption(page, '处理类型', '已提醒客户');
  await page.getByLabel('处理备注').fill('已私信提醒客户通过销售好友申请。');
  const handleResponse = page.waitForResponse((response) =>
    response.url().includes('/api/collaboration-tasks/task-a-001/handle') &&
    response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '提交处理结果' }).click();
  await expect((await handleResponse).ok()).toBeTruthy();
});

test('A-side lead draft recovery and operation message routing work', async ({ page }) => {
  await mockApi(page);
  await setOperationAuth(page);

  await gotoApp(page, '/operation/leads/new');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('联系方式').fill('wx-draft-2026');
  await page.getByLabel('客户昵称').fill('草稿客户');
  await page.getByLabel('需求备注').fill('计划申请英国硕士。');
  await page.reload();
  await expect(page.getByText('已恢复本地草稿')).toBeVisible();
  await expect(page.getByLabel('联系方式')).toHaveValue('wx-draft-2026');
  await expect(page.getByLabel('客户昵称')).toHaveValue('草稿客户');
  await expect(page.getByLabel('需求备注')).toHaveValue('计划申请英国硕士。');

  await selectAntdOption(page, '来源账号', /留学案例号/);
  await selectAntdOption(page, '分配销售', '销售张明');
  const createLeadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/leads') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '提交客资' }).click();
  await expect((await createLeadResponse).ok()).toBeTruthy();
  await page.waitForURL('**/operation/leads', { timeout: 30_000 });

  await gotoApp(page, '/operation/messages');
  await expect(page.getByRole('heading', { name: '运营消息' })).toBeVisible();
  await expect(page.getByText('协同任务待处理')).toBeVisible();
  await Promise.all([
    page.waitForURL('**/operation/collaboration?taskId=task-a-001', { timeout: 30_000 }),
    page.getByRole('button', { name: '查看并已读' }).click(),
  ]);
  await expect(page.getByRole('heading', { name: '协同处理' })).toBeVisible();
});
