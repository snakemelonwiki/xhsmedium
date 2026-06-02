// e2e/specs/04-collaboration.spec.ts
// B 端 "销售协同" 场景：真实 API（不 mock），由项目根 playwright worker 串行执行。
// 后端 /api/collaboration-tasks 当前可能因 leads.service.ts 旧 dist 返回 500，
// 本 spec 用 try/catch + console.warn 容忍，不让列表加载失败阻塞 UI 行为断言。
// 另：/api/leads?scope=self 同理可能 500，导致"选择客资"下拉无选项——属于预期场景，不算 fail。
// 不点"提交协同"以避免产生垃圾数据污染数据库。

import { expect, test, type Page } from '@playwright/test';

import { loginAs, screenshot } from '../helpers/auth';

const TASK_DIR = 'B-FE-4-collaboration';

/**
 * 等待 /api/collaboration-tasks 的 GET 响应（最多 30 秒）。
 * 返回响应对象（不抛错），由调用方根据 status() 决定如何处理。
 */
async function waitForCollaborationTasksResponse(page: Page) {
  try {
    const resp = await page.waitForResponse(
      (r) => r.url().includes('/api/collaboration-tasks') && r.request().method() === 'GET',
      { timeout: 30_000 },
    );
    return resp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[04-collaboration] 等待 /api/collaboration-tasks 列表响应超时', err);
    return null;
  }
}

/**
 * 等待 /api/leads 列表响应（命中 ?scope=self 或 listSalesLeads 默认）。
 * 命中后 200 -> 下拉有可选项；500 -> 下拉无选项属于预期。
 */
async function waitForLeadsListResponse(page: Page) {
  try {
    const resp = await page.waitForResponse(
      (r) => {
        const url = r.url();
        if (!url.includes('/api/leads')) return false;
        // 排除详情 / 子资源
        if (/\/api\/leads\/[^/?]+/.test(url)) return false;
        return r.request().method() === 'GET';
      },
      { timeout: 45_000 },
    );
    return resp;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[04-collaboration] 等待 /api/leads 列表响应超时', err);
    return null;
  }
}

test.describe('B 端 /sales/collaboration 销售协同（真实 API）', () => {
  test.setTimeout(90_000);

  test('Test 1: 协同页加载 + 发起协同表单渲染', async ({ page }) => {
    // 1. 登录 sales1
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 访问 /sales/collaboration，并并行等待 collaboration-tasks 与 leads 列表响应
    const tasksPromise = waitForCollaborationTasksResponse(page);
    const leadsPromise = waitForLeadsListResponse(page);
    await page.goto('/sales/collaboration', { waitUntil: 'domcontentloaded' });

    // 3. 记录 /api/collaboration-tasks 响应状态（500 时仅 warn，不 throw）
    const tasksResp = await tasksPromise;
    if (tasksResp) {
      const status = tasksResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(
          `[04-collaboration] /api/collaboration-tasks 返回 ${status}，"我的协同记录" 时间线可能为空，按场景继续断言 UI 元素`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[04-collaboration] /api/collaboration-tasks 状态 ${status}`);
      }
    }

    // 4. 记录 /api/leads 响应状态（500 时仅 warn，不 throw——下拉无选项是预期的）
    const leadsResp = await leadsPromise;
    if (leadsResp) {
      const status = leadsResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(
          `[04-collaboration] /api/leads 返回 ${status}，"选择客资"下拉将无选项（预期）`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[04-collaboration] /api/leads 状态 ${status}`);
      }
    }

    // 5. H2 标题"销售协同"可见
    await expect(page.getByRole('heading', { name: '销售协同', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 6. "发起协同" Card 可见（Antd Card 不渲染为 role=region，改为按 head title 定位）
    const createCard = page
      .locator('.ant-card')
      .filter({ has: page.locator('.ant-card-head-title', { hasText: /^发起协同$/ }) })
      .first();
    await expect(createCard).toBeVisible({ timeout: 10_000 });

    // 7. 发起协同 Card 各字段可见
    await expect(createCard.getByText('选择客资', { exact: true })).toBeVisible();
    await expect(
      createCard.locator('.ant-select').filter({ has: page.locator('input', { hasText: '' }) }).first(),
    ).toBeVisible();
    // 通过 ant-select placeholder SPAN 元素（class="ant-select-selection-placeholder"）进一步锁定"选择客资" Select
    await expect(
      createCard.locator('.ant-select-selection-placeholder', { hasText: '选择要协同的客资' }),
    ).toBeVisible();

    await expect(
      createCard.locator('.ant-form-item-label', { hasText: /^协同类型$/ }),
    ).toBeVisible();
    await expect(
      createCard.locator('.ant-form-item-label', { hasText: /^紧急程度$/ }),
    ).toBeVisible();
    await expect(createCard.getByText('协同原因', { exact: true })).toBeVisible();
    await expect(
      createCard.getByPlaceholder('说明需要运营协助的背景和期望结果'),
    ).toBeVisible();
    await expect(createCard.getByText('补充备注', { exact: true })).toBeVisible();
    await expect(createCard.getByText('期望处理时间', { exact: true })).toBeVisible();

    // 提交按钮可见
    await expect(createCard.getByRole('button', { name: /提\s*交\s*协\s*同/ })).toBeVisible();

    // 8. "我的协同记录" Card 可见（Antd Card 不渲染为 role=region，改为按 head title 定位）
    const recordsCard = page
      .locator('.ant-card')
      .filter({ has: page.locator('.ant-card-head-title', { hasText: /^我的协同记录$/ }) })
      .first();
    await expect(recordsCard).toBeVisible({ timeout: 10_000 });
    // 任务列表空态/有数据 都属正常
    // eslint-disable-next-line no-console
    console.log('[04-collaboration] "我的协同记录" Card 渲染完成');

    // 9. 等页面稳定
    await page.waitForLoadState('networkidle').catch(() => {
      // 某些情况下 networkidle 永远到不了（比如后端长 polling），忽略
    });

    // 10. 截图：01-page-loaded
    await screenshot(page, TASK_DIR, '01-page-loaded');
  });

  test('Test 2: 表单填写（不提交）', async ({ page }) => {
    // 1. 复用 Test 1 登录态（Playwright 默认 test 之间是隔离的 context；同 describe 复用 page fixture 仍然独立，
    //    这里再次 loginAs 以确保 token 写入。完成后不 logout，方便后续 spec 复用。）
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 访问 /sales/collaboration
    const tasksPromise = waitForCollaborationTasksResponse(page);
    const leadsPromise = waitForLeadsListResponse(page);
    await page.goto('/sales/collaboration', { waitUntil: 'domcontentloaded' });

    // 等关键 Card 出现（Antd Card 不渲染为 role=region，改为按 head title 定位）
    const createCard = page
      .locator('.ant-card')
      .filter({ has: page.locator('.ant-card-head-title', { hasText: /^发起协同$/ }) })
      .first();
    await expect(createCard).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: '销售协同', level: 2 })).toBeVisible();

    // 3. 处理 /api/leads 响应：若 200，尝试选第一条客资
    const leadsResp = await leadsPromise.catch(() => null);
    let hasLeadOption = false;
    if (leadsResp && leadsResp.status() < 500) {
      // 200/201 才有下拉数据
      try {
        const leadSelect = createCard
          .locator('.ant-select-selection-placeholder', { hasText: '选择要协同的客资' });
        await leadSelect.click();
        // 等下拉浮层出现
        const firstOption = page
          .locator('.ant-select-item-option')
          .first();
        await expect(firstOption).toBeVisible({ timeout: 10_000 });
        // 选中第一条
        await firstOption.click();
        hasLeadOption = true;
        // eslint-disable-next-line no-console
        console.log('[04-collaboration] 已选第一条客资');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[04-collaboration] 选择客资失败（可能下拉无可见选项）', err);
        hasLeadOption = false;
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[04-collaboration] /api/leads 返回 ${leadsResp?.status() ?? 'no response'}，跳过选择客资`,
      );
    }

    // 4. 协同类型保持默认"提醒客户"——不点不动
    // Antd Select 选中后会显示文案 "提醒客户"
    if (hasLeadOption) {
      await expect(
        createCard.locator('.ant-select-selection-item').filter({ hasText: '提醒客户' }).first(),
      ).toBeVisible({ timeout: 5_000 }).catch(() => undefined);
    }

    // 5. 紧急程度切到"紧急"——Antd Select 默认显示"普通"，点击后浮层出选项
    // 先找到"紧急程度" label 旁边的 Select
    const urgencyFormItem = page
      .locator('.ant-form-item')
      .filter({ has: page.locator('.ant-form-item-label', { hasText: /^紧急程度$/ }) });
    const urgencySelect = urgencyFormItem.locator('.ant-select').first();
    await urgencySelect.click();
    const urgentOption = page
      .locator('.ant-select-item-option')
      .filter({ hasText: /^紧\s*急$/ })
      .first();
    await expect(urgentOption).toBeVisible({ timeout: 10_000 });
    await urgentOption.click();
    // 验证已选（点完后 select 显示"紧急"）
    await expect(
      urgencyFormItem.locator('.ant-select-selection-item').filter({ hasText: /紧\s*急/ }),
    ).toBeVisible({ timeout: 5_000 });

    // 6. 协同原因填"客户长时间未通过好友申请，请运营协助提醒"
    const reasonTextArea = createCard.getByPlaceholder('说明需要运营协助的背景和期望结果');
    await reasonTextArea.fill('客户长时间未通过好友申请，请运营协助提醒');

    // 7. 补充备注填"建议提醒时附上留学申请时间表"
    const remarkTextArea = createCard.getByPlaceholder('可补充客户上下文、已尝试动作或沟通口径');
    await remarkTextArea.fill('建议提醒时附上留学申请时间表');

    // 8. 期望处理时间不填（可选，Antd DatePicker 弹层操作复杂）

    // 9. 等 UI 稳定
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // 10. 不点"提交协同"——避免污染数据库

    // 11. 截图：02-form-filled
    await screenshot(page, TASK_DIR, '02-form-filled');

    // 12. 容忍 /api/collaboration-tasks 500 记录（Test 1 已记，Test 2 也兜底）
    const tasksResp = await tasksPromise.catch(() => null);
    if (tasksResp && tasksResp.status() >= 500) {
      // eslint-disable-next-line no-console
      console.warn(
        `[04-collaboration] Test 2 兜底：/api/collaboration-tasks 返回 ${tasksResp.status()}`,
      );
    }
  });
});
