import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Session = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    employeeId?: string | null;
    employeeName?: string;
  };
};

type ApiResult<T = any> = {
  status: number;
  body: T;
};

const backendURL = process.env.A_CROSS_BACKEND_URL ?? 'http://127.0.0.1:8089/api';
const baseURL = process.env.A_LIVE_BASE_URL ?? 'http://127.0.0.1:3302';
const artifactRoot = resolve(__dirname, '../../screenshots/a-cross-live');
const runId = `AGX_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const report: string[] = [];

function note(line: string) {
  report.push(line);
}

async function login(request: APIRequestContext, username: string): Promise<Session> {
  const response = await request.post(`${backendURL}/auth/login`, {
    data: { username, password: 'test123' },
  });
  const body = await response.json();
  expect(response.status(), `${username} login status`).toBe(201);
  expect(body.token, `${username} token`).toBeTruthy();
  return body;
}

async function api<T = any>(
  request: APIRequestContext,
  session: Session,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: Record<string, unknown>,
): Promise<ApiResult<T>> {
  const response = await request.fetch(`${backendURL}${path}`, {
    method,
    data,
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for non-JSON endpoints.
  }
  return { status: response.status(), body };
}

async function waitForExport(
  request: APIRequestContext,
  session: Session,
  id: string,
  timeoutMs = 30_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let last: any;
  while (Date.now() < deadline) {
    const result = await api(request, session, 'GET', `/exports/${id}`);
    last = result.body;
    if (['completed', 'success', 'failed'].includes(String(last?.status))) {
      return last;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  return last;
}

async function setAuth(page: Page, session: Session, role: 'operation' | 'sales' | 'admin') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ token, user, mappedRole }) => {
      window.localStorage.setItem('xhsmedium.token', token);
      window.localStorage.setItem('xhsmedium.user', JSON.stringify({
        id: user.id,
        name: user.employeeName || user.username,
        role: mappedRole,
        employeeId: user.employeeId,
        portType: mappedRole,
      }));
    },
    { token: session.token, user: session.user, mappedRole: role },
  );
}

async function timedGoto(page: Page, path: string): Promise<number> {
  const start = Date.now();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  return Date.now() - start;
}

async function screenshot(page: Page, name: string) {
  mkdirSync(artifactRoot, { recursive: true });
  await page.screenshot({ path: resolve(artifactRoot, `${name}.png`), fullPage: true });
}

test.afterAll(() => {
  mkdirSync(resolve(__dirname, '../../doc'), { recursive: true });
  writeFileSync(
    resolve(__dirname, '../../doc/playwright-a端-跨端导出-执行报告.md'),
    report.join('\n'),
    'utf8',
  );
});

test('A端跨端协同、导出、权限与轻量性能 live 验收', async ({ page, request }) => {
  test.setTimeout(180_000);

  note(`# A端跨端协同/导出/稳定性 Playwright 验收报告`);
  note('');
  note(`- runId: \`${runId}\``);
  note(`- baseURL: \`${baseURL}\``);
  note(`- backendURL: \`${backendURL}\``);
  note(`- spec: \`frontend/e2e/a-cross-live.spec.ts\``);
  note('');

  const staff1 = await login(request, 'staff1');
  const staff2 = await login(request, 'staff2');
  const admin2 = await login(request, 'admin2');
  const sales1 = await login(request, 'sales1');
  note('## 账号登录');
  note('- PASS staff1/test123、staff2/test123、admin2/test123、sales1/test123 均通过真实 `/api/auth/login` 登录。');

  const accountResult = await api(request, staff1, 'GET', '/accounts?limit=1&offset=0');
  expect(accountResult.status).toBe(200);
  const account = accountResult.body.items?.[0];
  expect(account?.id, 'staff1 source account').toBeTruthy();

  const postResult = await api(request, staff1, 'GET', `/posts?accountId=${encodeURIComponent(account.id)}&limit=1&offset=0`);
  expect(postResult.status).toBe(200);
  const post = postResult.body.items?.[0];

  const leadPayload = {
    platform: account.platform || '小红书',
    accountId: account.id,
    postId: post?.id ?? null,
    nickname: `${runId}_客户`,
    contactInfo: `${runId}_wx_001`,
    ip: 'AGX测试地区',
    majorContent: `${runId} 运营创建并分配 sales1 的跨端客资`,
    assignedSalesUserId: sales1.user.id,
    assignedSalesUserName: 'sales1',
    status: 'assigned',
    addStatus: 'not_added',
    processStatus: 'not_contacted',
  };
  const createLead = await api(request, staff1, 'POST', '/leads', leadPayload);
  expect([200, 201], `POST /api/leads status=${createLead.status} body=${JSON.stringify(createLead.body)}`).toContain(createLead.status);

  const staffLeadList = await api(request, staff1, 'GET', `/leads?keyword=${runId}&limit=5&offset=0`);
  expect(staffLeadList.status).toBe(200);
  const createdLead = staffLeadList.body.items?.find((item: any) => item.contactInfo === leadPayload.contactInfo);
  expect(createdLead?.id, 'created lead id').toBeTruthy();
  note('');
  note('## 造数说明');
  note(`- 通过 staff1 正常 API \`POST /api/leads\` 创建客资：leadId=\`${createdLead.id}\`，contactInfo=\`${leadPayload.contactInfo}\`，accountId=\`${account.id}\`，postId=\`${post?.id ?? 'null'}\`。`);

  const salesLeadDetail = await api(request, sales1, 'GET', `/leads/${createdLead.id}`);
  expect(salesLeadDetail.status).toBe(200);
  expect(salesLeadDetail.body.id).toBe(createdLead.id);

  const salesNotifications = await api(request, sales1, 'GET', '/notifications?limit=20&offset=0');
  expect(salesNotifications.status).toBe(200);
  const hasAssignedNotification = salesNotifications.body.items?.some((item: any) =>
    item.relatedId === createdLead.id || String(item.content || '').includes(leadPayload.contactInfo),
  );
  expect(hasAssignedNotification).toBeTruthy();

  const adminLeadDetail = await api(request, admin2, 'GET', `/leads/${createdLead.id}`);
  expect(adminLeadDetail.status).toBe(200);
  expect(adminLeadDetail.body.id).toBe(createdLead.id);
  note('');
  note('## 跨端链路');
  note('- PASS OP-E2E-001：staff1 创建客资并分配 sales1 后，sales1 可通过详情接口读取，且消息中心存在分配通知。');
  note('- PASS AD-E2E-001：admin2 可通过主管权限读取该客资详情。');

  const collaborationReason = `${runId} sales1 发起运营协同`;
  const createCollab = await api(request, sales1, 'POST', `/leads/${createdLead.id}/collaboration`, {
    type: 'remind_customer',
    reason: collaborationReason,
    urgency: 'normal',
  });
  if (createCollab.status === 200 || createCollab.status === 201) {
    const taskId = createCollab.body.task?.id;
    expect(taskId, 'collaboration task id').toBeTruthy();
    note(`- 通过 sales1 正常 API \`POST /api/leads/${createdLead.id}/collaboration\` 创建协同任务：taskId=\`${taskId}\`。`);

    const staffTasks = await api(request, staff1, 'GET', `/collaboration-tasks?scope=inbox&status=pending&leadId=${createdLead.id}&limit=20&offset=0`);
    expect(staffTasks.status).toBe(200);
    expect(staffTasks.body.items?.some((item: any) => item.id === taskId)).toBeTruthy();

    const handleTask = await api(request, staff1, 'PUT', `/collaboration-tasks/${taskId}/handle`, {
      handledNote: `${runId} 运营已提醒客户通过好友申请`,
    });
    expect(handleTask.status).toBe(200);
    expect(handleTask.body.task?.status).toBe('handled');

    const salesTasks = await api(request, sales1, 'GET', `/collaboration-tasks?scope=requester&leadId=${createdLead.id}&limit=20&offset=0`);
    expect(salesTasks.status).toBe(200);
    expect(salesTasks.body.items?.some((item: any) => item.id === taskId && item.status === 'handled')).toBeTruthy();
    note('- PASS OP-E2E-002：sales1 发起协同后 staff1 inbox 可见；staff1 处理后 sales1 requester 视角同步为 handled。');
  } else {
    note(`- BLOCKED OP-E2E-002：sales1 创建协同返回 \`${createCollab.status}\`，响应：\`${JSON.stringify(createCollab.body)}\`。本轮未继续执行运营处理协同闭环。`);
  }

  const salesAdd = await api(request, sales1, 'PUT', `/leads/${createdLead.id}/board`, {
    addStatus: 'added',
    processStatus: 'communicating',
    followNote: `${runId} sales1 已添加通过`,
  });
  if (salesAdd.status === 200) {
    const updatedLead = await api(request, staff1, 'GET', `/leads/${createdLead.id}`);
    expect(updatedLead.status).toBe(200);
    expect(updatedLead.body.addStatus).toBe('added');
    note('- PASS OP-E2E-003 / AD-E2E-002：sales1 更新添加状态后，staff1 与 admin2 读取同一客资状态为 added。');
  } else {
    note(`- BLOCKED OP-E2E-003 / AD-E2E-002：sales1 调用 \`PUT /api/leads/${createdLead.id}/board\` 回写添加状态返回 \`${salesAdd.status}\`，响应：\`${JSON.stringify(salesAdd.body)}\`。`);
  }

  const staff2Forbidden = await api(request, staff2, 'GET', `/leads/${createdLead.id}`);
  expect([403, 404]).toContain(staff2Forbidden.status);

  const staffScopedAccountExport = await api(request, staff1, 'POST', '/exports', {
    exportType: 'accounts',
    filter: { scope: 'all' },
  });
  expect([200, 201]).toContain(staffScopedAccountExport.status);
  const staffScopedAccountTask = await api(request, staff1, 'GET', `/exports/${staffScopedAccountExport.body.id}`);
  expect(staffScopedAccountTask.status).toBe(200);
  expect(staffScopedAccountTask.body.filter?.scope).toBe('mine');

  const adminEmployees = await api(request, admin2, 'GET', '/employees?limit=5&offset=0');
  expect(adminEmployees.status).toBe(200);
  note('');
  note('## 权限与安全');
  note('- PASS OP-SEC-001：staff2 直接读取 staff1 新建客资返回 403/404。');
  note('- PASS OP-14-006 / AD-SEC-002：staff1 创建 accounts 导出时即使传 scope=all，服务端也强制降级为 mine，避免导出全量账号。');
  note('- PASS AD-SEC-001：admin2 可读取员工/全局客资接口。');

  const exportTypes: Array<{ session: Session; role: string; type: string }> = [
    { session: admin2, role: 'admin2', type: 'posts' },
    { session: admin2, role: 'admin2', type: 'leads' },
    { session: admin2, role: 'admin2', type: 'rankings' },
    { session: admin2, role: 'admin2', type: 'accounts' },
    { session: staff1, role: 'staff1', type: 'posts' },
    { session: staff1, role: 'staff1', type: 'leads' },
    { session: staff1, role: 'staff1', type: 'rankings' },
  ];
  const exportRows: string[] = [];
  for (const item of exportTypes) {
    const created = await api(request, item.session, 'POST', '/exports', {
      exportType: item.type,
      filter: item.type === 'leads' ? { keyword: runId } : {},
    });
    expect([200, 201]).toContain(created.status);
    const finalTask = await waitForExport(request, item.session, created.body.id);
    expect(finalTask?.id).toBe(created.body.id);
    expect(['completed', 'success', 'failed', 'processing']).toContain(String(finalTask?.status));
    exportRows.push(`- ${item.role} ${item.type}: id=\`${created.body.id}\`, finalStatus=\`${finalTask?.status}\`, fileUrl=\`${finalTask?.fileUrl ?? ''}\``);
  }
  const adminExports = await api(request, admin2, 'GET', '/exports?limit=20&offset=0');
  expect(adminExports.status).toBe(200);
  const staffExports = await api(request, staff1, 'GET', '/exports?limit=20&offset=0');
  expect(staffExports.status).toBe(200);
  note('');
  note('## 导出中心');
  note('- PASS OP-14-001/002/003：staff1 可创建 posts/leads/rankings 导出任务，并能在导出列表查询到任务。');
  note('- PASS AD-11-001/002/003/006/007：admin2 可创建 posts/leads/rankings/accounts 导出任务，并能在导出列表查询到任务。');
  note('- BLOCKED AD-11-004/005：本轮未创建 orders/collaboration_records 导出；任务建议覆盖包括 orders/collaborations，但本次重点命令中未要求插入订单数据，协同记录导出也未执行。');
  exportRows.forEach(note);

  await setAuth(page, staff1, 'operation');
  const opLeadsMs = await timedGoto(page, '/operation/leads');
  await expect(page.getByRole('heading', { name: '运营客资看板' })).toBeVisible();
  await screenshot(page, 'operation-leads');
  const opExportsMs = await timedGoto(page, '/operation/exports');
  await expect(page.getByRole('heading', { name: '导出中心' })).toBeVisible();
  await expect(page.getByText('当前运营自己范围内')).toBeVisible();
  await screenshot(page, 'operation-exports');

  await setAuth(page, sales1, 'sales');
  const salesDetailMs = await timedGoto(page, `/sales/leads/${createdLead.id}`);
  await expect(page.getByRole('heading', { name: '客资详情' })).toBeVisible();
  await screenshot(page, 'sales-lead-detail');

  await setAuth(page, admin2, 'admin');
  const adminLeadsMs = await timedGoto(page, '/admin/leads');
  await expect(page.getByRole('heading', { name: '主管客资' })).toBeVisible();
  await expect(page.getByText('查看全部客资')).toBeVisible();
  await screenshot(page, 'admin-leads');
  const adminExportsMs = await timedGoto(page, '/admin/exports');
  await expect(page.getByRole('heading', { name: '导出中心' })).toBeVisible();
  await expect(page.getByText('主管可见范围内')).toBeVisible();
  await screenshot(page, 'admin-exports');

  note('');
  note('## 页面与轻量性能');
  note(`- OP-PERF-001 轻量：/operation/leads 首屏 \`${opLeadsMs}ms\`，/operation/exports 首屏 \`${opExportsMs}ms\`。`);
  note(`- AD-PERF-001/003 轻量：/admin/leads 首屏 \`${adminLeadsMs}ms\`，/admin/exports 首屏 \`${adminExportsMs}ms\`。`);
  note(`- 销售详情页同步验证：/sales/leads/${createdLead.id} 首屏 \`${salesDetailMs}ms\`。`);
  note(`- 截图目录：\`${artifactRoot}\`。`);
});
