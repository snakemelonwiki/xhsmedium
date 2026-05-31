import { expect, test, type Page, type Route } from '@playwright/test';
import { resolve } from 'node:path';

const screenshotRoot = resolve(__dirname, '../../screenshots/b-acceptance');

const leadA = {
  id: 'lead-b-001',
  customerName: '林同学',
  nickname: '小林',
  contact: 'wx-lin-2026',
  phone: '13800000001',
  wechat: 'wx-lin-2026',
  platform: '小红书',
  accountName: '留学案例号',
  postTitle: '英国硕士申请避坑指南',
  operatorName: '运营王敏',
  assignedAt: '2026-05-31 09:30:00',
  status: 'assigned',
  addStatus: 'not_added',
  processStatus: 'not_contacted',
  collaborationStatus: 'none',
  latestFollowNote: '客户咨询英国硕士申请，需首次触达。',
  latestFollowAt: '2026-05-31 10:00:00',
  nextFollowAt: '2025-01-01T18:30',
};

const leadB = {
  id: 'lead-b-002',
  customerName: '陈同学',
  nickname: '小陈',
  contact: 'wx-chen-2026',
  platform: '小红书',
  accountName: '申请规划号',
  postTitle: '港校申请时间线',
  operatorName: '运营李雷',
  assignedAt: '2026-05-30 16:20:00',
  status: 'operation_handled',
  addStatus: 'not_passed',
  processStatus: 'communicating',
  collaborationStatus: 'handled',
  latestFollowNote: '运营已二次提醒客户通过好友申请。',
  latestFollowAt: '2026-05-31 11:20:00',
  nextFollowAt: '2025-01-01T17:00',
};

const followRecords = [
  {
    id: 'follow-001',
    title: '首次跟进',
    content: '已发送好友申请，等待客户通过。',
    processStatus: 'waiting_pass',
    userName: '销售张明',
    occurredAt: '2026-05-31 10:10:00',
  },
];

const collaborationRecords = [
  {
    id: 'collab-001',
    type: 'remind_customer',
    reason: '客户长时间未通过好友申请，请运营协助提醒。',
    requesterName: '销售张明',
    operatorName: '运营王敏',
    status: 'handled',
    urgency: 'normal',
    createdAt: '2026-05-31 10:40:00',
    handledNote: '已私信提醒客户通过销售好友申请。',
  },
];

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function pageResult<T>(items: T[]) {
  return { items, total: items.length, limit: 20, offset: 0 };
}

async function screenshot(page: Page, task: string, name: string) {
  await page.screenshot({
    path: resolve(screenshotRoot, task, `${name}.png`),
    fullPage: true,
  });
}

async function mockApi(page: Page) {
  let leadAState = { ...leadA };
  let submittedCollaboration = false;
  let notificationUnread = true;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();
    const status = url.searchParams.get('status');
    const addStatus = url.searchParams.get('addStatus');

    if (path === '/auth/login' && method === 'POST') {
      return json(route, {
        token: 'b-acceptance-token',
        user: {
          id: 'sales-b-001',
          username: 'sales',
          role: 'sales',
          employeeId: 'emp-sales-b',
          employeeName: '销售张明',
        },
      });
    }

    if (path === '/leads' && method === 'GET') {
      let items = [leadAState, leadB];
      if (status) {
        items = items.filter((item) => item.status === status);
      }
      if (addStatus) {
        items = items.filter((item) => item.addStatus === addStatus);
      }
      return json(route, pageResult(items));
    }

    if (path === `/leads/${leadA.id}` && method === 'GET') {
      return json(route, leadAState);
    }

    if (path === `/leads/${leadA.id}/follow-records` && method === 'GET') {
      return json(route, pageResult(followRecords));
    }

    if (path === `/leads/${leadA.id}/follow-records` && method === 'POST') {
      leadAState = {
        ...leadAState,
        status: 'in_followup',
        addStatus: 'applied',
        processStatus: 'communicating',
        latestFollowNote: '已完成快速跟进，约定晚间继续沟通。',
        latestFollowAt: '2026-05-31 14:30:00',
      };
      return json(route, { ok: true, id: 'follow-002' });
    }

    if (path === `/leads/${leadA.id}/board` && method === 'PUT') {
      return json(route, { ok: true });
    }

    if (path === `/leads/${leadA.id}/collaboration` && method === 'POST') {
      submittedCollaboration = true;
      leadAState = {
        ...leadAState,
        status: 'in_collaboration',
        collaborationStatus: 'pending',
      };
      return json(route, { ok: true, id: 'collab-002' });
    }

    if (path === '/collaboration-tasks' && method === 'GET') {
      const records = submittedCollaboration
        ? [
            {
              id: 'collab-002',
              type: 'remind_customer',
              reason: '客户未通过好友申请，请运营协助提醒。',
              requesterName: '销售张明',
              status: 'pending',
              urgency: 'urgent',
              createdAt: '2026-05-31 14:40:00',
            },
            ...collaborationRecords,
          ]
        : collaborationRecords;
      return json(route, pageResult(records));
    }

    if (path === '/notifications' && method === 'GET') {
      return json(route, {
        items: [
          {
            id: 'notice-b-001',
            notificationType: 'lead_assigned',
            title: '新客资提醒',
            content: '林同学 已分配给你，请及时跟进。',
            unread: notificationUnread,
            readStatus: notificationUnread ? 0 : 1,
            createdAt: '2026-05-31 13:00:00',
            relatedType: 'lead',
            relatedId: leadA.id,
            routeHint: `/sales/leads/${leadA.id}`,
          },
        ],
        unreadCount: notificationUnread ? 1 : 0,
        total: 1,
        limit: 20,
        offset: 0,
      });
    }

    if (path === '/notifications/read-all' && method === 'POST') {
      notificationUnread = false;
      return json(route, { ok: true, affected: 1 });
    }

    if (path === '/notifications/notice-b-001/read' && method === 'POST') {
      notificationUnread = false;
      return json(route, { ok: true, changed: true });
    }

    return json(route, { ok: true });
  });
}

test('B-side acceptance clicks save reviewable screenshots with mocked API', async ({ page }) => {
  await mockApi(page);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '登录工作台' })).toBeVisible();
  await page.getByPlaceholder('用户名').fill('sales');
  await page.getByPlaceholder('密码').fill('sales123');
  await page.locator('.login-submit').click();
  await page.waitForURL('**/sales/leads', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '我的客资' })).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText('林同学')).toBeVisible();
  await screenshot(page, 'B-FE-2-my-leads', '01-login-my-leads');

  await page.locator('.toolbar-row').getByText('全部状态').click();
  await page.getByTitle('新分配').click();
  await expect(page.getByText('林同学')).toBeVisible();
  await expect(page.getByText('陈同学')).toBeHidden();
  await screenshot(page, 'B-FE-2-my-leads', '02-status-filter-assigned');

  await page.goto('/sales/followups');
  await expect(page.getByRole('heading', { name: '待跟进' })).toBeVisible();
  await page.getByText('到期跟进').click();
  await expect(page.getByText('林同学')).toBeVisible();
  await screenshot(page, 'B-FE-3-followups', '01-due-followups');

  await page.getByRole('button', { name: '查看详情' }).first().click();
  await expect(page.getByRole('heading', { name: '客资详情' })).toBeVisible();
  await expect(page.getByText('下一步：首次联系客户并记录跟进')).toBeVisible();
  await screenshot(page, 'B-FE-4-detail', '01-detail-status');

  await page.getByLabel('跟进备注').fill('已电话沟通，客户希望晚间补充预算与目标专业。');
  await page.getByLabel('下次跟进时间').fill('2026-05-31T20:00');
  const followResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/leads/${leadA.id}/follow-records`) && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存跟进' }).click();
  await expect((await followResponse).ok()).toBeTruthy();
  await expect(page.getByText('已申请添加')).toBeVisible();
  await expect(page.getByText('沟通中').first()).toBeVisible();
  await screenshot(page, 'B-FE-5-follow-action', '01-follow-saved');

  await page.getByRole('tab', { name: '跟进/协同时间线' }).click();
  await expect(page.getByText('首次跟进')).toBeVisible();
  await expect(page.getByText('协同记录 · 提醒客户')).toBeVisible();
  await screenshot(page, 'B-FE-4-detail', '02-detail-timeline');

  await page.getByRole('button', { name: '申请运营协同' }).click();
  await expect(page.getByRole('dialog', { name: '申请运营协同' })).toBeVisible();
  await page.getByLabel('协同原因').fill('客户未通过好友申请，请运营协助提醒并补充来源上下文。');
  await page.getByLabel('补充备注').fill('客户重点关注英国商科，建议提醒时强调案例资料已准备。');
  await page.getByRole('button', { name: '提交协同' }).click();
  await expect(page.getByText('下一步：等待运营处理协同，必要时补充协同原因')).toBeVisible();
  await screenshot(page, 'B-FE-6-collaboration', '01-collaboration-submitted');

  await page.goto('/sales/messages');
  await expect(page.getByRole('heading', { name: '销售消息' })).toBeVisible();
  await expect(page.getByText('新客资提醒')).toBeVisible();
  await screenshot(page, 'B-FE-7-messages', '01-sales-messages');

  await page.getByRole('button', { name: '查看并已读' }).click();
  await expect(page).toHaveURL(/\/sales\/leads\/lead-b-001/);
  await expect(page.getByRole('heading', { name: '客资详情' })).toBeVisible();
  await screenshot(page, 'B-FE-7-messages', '02-message-click-detail');
});
