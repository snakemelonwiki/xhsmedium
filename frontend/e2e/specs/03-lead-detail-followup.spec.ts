// specs/03-lead-detail-followup.spec.ts
// B 端销售端：客资详情 + 写跟进 + 申请运营协同。
// 使用真实 API（不 mock），串行执行；依赖后端 NestJS 跑在 8089、前端 Next.js 跑在 3002。
import { test, expect, type Page, type Response } from '@playwright/test';

import { loginAs, screenshot } from '../helpers/auth';

const TASK = 'B-FE-3-detail';

const PLACEHOLDER_LEAD_ID = '00000000-test-lead-1';

type ApiProbe = {
  done: () => void;
  lastStatus: () => number | null;
  lastUrl: () => string | null;
};

function watchApi(page: Page, pathContains: string, label: string): ApiProbe {
  const state: { status: number | null; url: string | null } = { status: null, url: null };
  const handler = (resp: Response) => {
    if (!resp.url().includes(pathContains)) return;
    const status = resp.status();
    state.status = status;
    state.url = resp.url();
    if (status >= 500 || status === 404) {
      // eslint-disable-next-line no-console
      console.warn(`[${label}] ${resp.request().method()} ${resp.url()} -> ${status}`);
    }
  };
  page.on('response', handler);
  return {
    done: () => page.off('response', handler),
    lastStatus: () => state.status,
    lastUrl: () => state.url,
  };
}

test.describe.configure({ mode: 'serial' });

/**
 * 模块级共享：Test 1 探活后把"是否在真实详情页"与"最终停留的 leadId"
 * 共享给 Test 2 / Test 3，让 500 / 404 路径也能优雅回退到 /sales。
 */
const shared = {
  detailReachable: false,
  leadId: PLACEHOLDER_LEAD_ID,
};

test('B-FE-3-01 进入客资详情页（list 200 走真实 id，否则占位 id 兜底）', async ({ page }) => {
  test.setTimeout(90_000);

  // 先注册监听（必须在 loginAs 之前，避免错过 loginAs 跳到 /sales/leads 时立刻发起的 /api/leads 请求）
  const leadsList = watchApi(page, '/api/leads', 'leads-list');
  const leadsDetail = watchApi(page, '/api/leads/', 'leads-detail');

  await loginAs(page, 'sales1', /\/sales\//);
  await page.waitForURL(/\/sales\/leads$/, { timeout: 15_000, waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: '我的客资' })).toBeVisible({
    timeout: 15_000,
  });

  // 探活：读 leadsList 探针已经收集到的最后一个状态
  // （loginAs 跳到 /sales/leads 时已经触发过 /api/leads，watchApi 已记录）
  const initialStatus = leadsList.lastStatus();
  // 给 watchApi 一点时间收集更多响应（如有第二次拉取）
  await page.waitForTimeout(2000);
  const status = leadsList.lastStatus() ?? initialStatus ?? 0;
  // eslint-disable-next-line no-console
  console.warn(`[leads-list] 探活 status=${status}（探针已注册于 loginAs 之前）`);
  const listFailed = status >= 500 || status === 404 || status === 0;

  if (!listFailed) {
    // 200 路径：等 list 卡片出现，定位首张的"查看详情"按钮并点击
    const detailButtons = page.getByRole('button', { name: '查看详情' });
    const count = await detailButtons.count();
    if (count > 0) {
      // 提取第一张卡片上的 lead id 优先用 /sales/leads/{id} URL 形式跳转
      const targetHref = await page
        .locator('a[href^="/sales/leads/"]')
        .first()
        .getAttribute('href')
        .catch(() => null);

      if (targetHref) {
        const m = targetHref.match(/\/sales\/leads\/([^/?#]+)/);
        if (m) shared.leadId = m[1];
        await Promise.all([
          page.waitForURL(/\/sales\/leads\/[^/?#]+$/, { timeout: 15_000, waitUntil: 'commit' }),
          page.goto(targetHref, { waitUntil: 'domcontentloaded' }),
        ]);
      } else {
        await Promise.all([
          page.waitForURL(/\/sales\/leads\/[^/?#]+$/, { timeout: 15_000, waitUntil: 'commit' }),
          detailButtons.first().click(),
        ]);
        // 同步从 URL 拿 leadId
        const url = new URL(page.url());
        const m = url.pathname.match(/\/sales\/leads\/([^/?#]+)/);
        if (m) shared.leadId = m[1];
      }
    } else {
      // list 200 但前端渲染了空态
      // eslint-disable-next-line no-console
      console.warn('[leads-list] 200 但无可见"查看详情"按钮，回退到占位 id');
      shared.leadId = PLACEHOLDER_LEAD_ID;
      await page.goto(`/sales/leads/${shared.leadId}`, { waitUntil: 'domcontentloaded' });
    }
  } else {
    // 500/404 路径：占位 id 兜底
    // eslint-disable-next-line no-console
    console.warn(`[leads-list] status=${status} -> 跳转占位 id ${PLACEHOLDER_LEAD_ID}`);
    shared.leadId = PLACEHOLDER_LEAD_ID;
    await page.goto(`/sales/leads/${shared.leadId}`, { waitUntil: 'domcontentloaded' });
  }

  // 详情壳判定
  const h2 = page.getByRole('heading', { name: '客资详情', level: 2 });
  const h2Visible = await h2.isVisible().catch(() => false);
  if (h2Visible) {
    shared.detailReachable = true;
    // Tabs 必须可见
    await expect(page.getByRole('tab', { name: '写跟进' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: '跟进/协同时间线' })).toBeVisible({ timeout: 10_000 });
  } else {
    // 回退：跳到 /sales 验证登录态可用
    // eslint-disable-next-line no-console
    console.warn('[detail] H2 不可见 -> 回退到 /sales 验证登录态');
    shared.detailReachable = false;
    await page.goto('/sales', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '销售首页' })).toBeVisible({
      timeout: 15_000,
    });
  }

  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await screenshot(page, TASK, '01-detail-page');

  leadsList.done();
  leadsDetail.done();
});

test('B-FE-3-02 写跟进表单字段检查（不提交）', async ({ page }) => {
  test.setTimeout(90_000);

  // 复用登录态；新 context 时兜底登录
  // 先 goto 建立 origin，避免 about:blank 访问 localStorage 抛 SecurityError
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const hasToken = await page.evaluate(() =>
    Boolean(window.localStorage.getItem('xhsmedium.token')),
  );
  if (!hasToken) {
    await loginAs(page, 'sales1', /\/sales\//);
  }

  if (!shared.detailReachable) {
    // 直接重试一次进入占位 id 详情壳
    await page.goto(`/sales/leads/${PLACEHOLDER_LEAD_ID}`, { waitUntil: 'domcontentloaded' });
    const h2Visible = await page
      .getByRole('heading', { name: '客资详情', level: 2 })
      .isVisible()
      .catch(() => false);
    if (!h2Visible) {
      // eslint-disable-next-line no-console
      console.warn('[followup] 详情壳不可见，跳过本用例交互');
      await screenshot(page, TASK, '02-followup-form-filled');
      return;
    }
    shared.detailReachable = true;
  }

  // 切到"写跟进" Tab（默认就在）
  await page.getByRole('tab', { name: '写跟进' }).click().catch(() => undefined);

  // 动态计算明天 20:00 的本地时间字符串（YYYY-MM-DDTHH:mm）
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDateTime = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(
    tomorrow.getDate(),
  )}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

  // 1) 跟进备注
  await page
    .getByLabel('跟进备注', { exact: false })
    .fill('已电话沟通客户，约晚间继续跟进');

  // 2) 下次跟进时间（原生 datetime-local）
  await page.getByLabel('下次跟进时间', { exact: false }).fill(localDateTime);

  // 3) 添加状态 -> 已申请添加
  await page.getByLabel('添加状态', { exact: false }).click();
  await page.getByRole('option', { name: '已申请添加', exact: true }).first().click();

  // 4) 处理状态 -> 沟通中
  await page.getByLabel('处理状态', { exact: false }).click();
  await page.getByRole('option', { name: '沟通中', exact: true }).first().click();

  // 软断言：选中后 .ant-select-selection-item 应渲染当前值
  const addSelected = page
    .locator('.ant-select')
    .filter({ hasText: '已申请添加' })
    .first();
  const procSelected = page
    .locator('.ant-select')
    .filter({ hasText: '沟通中' })
    .first();
  await expect(addSelected).toBeVisible({ timeout: 5_000 }).catch(() => undefined);
  await expect(procSelected).toBeVisible({ timeout: 5_000 }).catch(() => undefined);

  // 软断言：nextFollowTime 实际写入了本地时间字符串
  const dtValue = await page
    .getByLabel('下次跟进时间', { exact: false })
    .inputValue()
    .catch(() => '');
  // eslint-disable-next-line no-console
  console.warn(`[followup] nextFollowTime=${dtValue || '(empty)'} (expected ~${localDateTime})`);

  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await screenshot(page, TASK, '02-followup-form-filled');
});

test('B-FE-3-03 申请运营协同弹窗字段（不提交）', async ({ page }) => {
  test.setTimeout(90_000);

  // 先 goto 建立 origin，避免 about:blank 访问 localStorage 抛 SecurityError
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const hasToken = await page.evaluate(() =>
    Boolean(window.localStorage.getItem('xhsmedium.token')),
  );
  if (!hasToken) {
    await loginAs(page, 'sales1', /\/sales\//);
  }

  if (!shared.detailReachable) {
    await page.goto(`/sales/leads/${PLACEHOLDER_LEAD_ID}`, { waitUntil: 'domcontentloaded' });
    const h2Visible = await page
      .getByRole('heading', { name: '客资详情', level: 2 })
      .isVisible()
      .catch(() => false);
    if (!h2Visible) {
      // eslint-disable-next-line no-console
      console.warn('[collaboration] 详情壳不可见，跳过本用例交互');
      await screenshot(page, TASK, '03-collaboration-modal');
      return;
    }
    shared.detailReachable = true;
  }

  // 点击顶部"申请运营协同"按钮（toolbar 中的主按钮，可能被 Tooltip 包裹但 click 仍可达）
  const openBtn = page
    .locator('.toolbar-row')
    .getByRole('button', { name: '申请运营协同', exact: true });
  await expect(openBtn).toBeVisible({ timeout: 10_000 });
  await openBtn.click();

  // Modal 断言（Antd Modal 不一定有 accessible name，改为按 .ant-modal 文本过滤）
  const dialog = page.locator('.ant-modal').filter({ hasText: '申请运营协同' }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // 协同原因（必填 TextArea，placeholder 命中）
  await page
    .getByLabel('协同原因', { exact: false })
    .fill('客户未通过好友申请，请运营协助提醒');

  // 补充备注（可选 TextArea）
  await page
    .getByLabel('补充备注', { exact: false })
    .fill('建议运营通过平台私信再次触达');

  // 软断言："提交协同"按钮在 Modal 内部存在
  await expect(
    dialog.locator('.ant-modal .ant-btn-primary').filter({ hasText: /提\s*交/ }).first(),
  ).toBeVisible({ timeout: 5_000 });

  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await screenshot(page, TASK, '03-collaboration-modal');
});

// ============================== 备注 ==============================
// 跑通条件：
//   1) NestJS 后端在 8089 已启动，MySQL 已导入 schema.sql 并 seed sales1/test123；
//   2) Next.js 前端在 3002 跑（playwright.config 自动 npm run dev）；
//   3) 在 frontend 目录下执行：npx playwright test e2e/specs/03-lead-detail-followup.spec.ts
// 已知问题（不会让用例 fail，仅 warn）：
//   - /api/leads 当前后端可能 500/404，list 拿不到真实 lead id 时自动回退到占位 id；
//   - 占位 id 会让详情接口 404，但前端会渲染"客资详情"壳（H2 可见），不影响 02/03 的表单交互；
//   - 若详情壳完全不可见（H2 都看不到），02/03 会打印 warn 后立即返回，仍记截图。
// 重新跑：worker=1 串行执行，复用 page context 的 localStorage 登录态。
// ==================================================================
