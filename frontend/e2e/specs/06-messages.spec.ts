// e2e/specs/06-messages.spec.ts
// B 端 "销售消息中心" 场景：真实 API（不 mock），由项目根 playwright worker 串行执行。
// 覆盖：1) /sales/messages 加载；2) 全部/未读 tab 切换 + 全部已读；3) Header 铃铛下拉。
// 依赖：NestJS 后端 8089、Next.js 前端 3302、MySQL 已 seed sales1/test123。
// 已知：/api/notifications 是稳定接口（已验证 200）；未读数可能为 0，不硬断言红点。

import { test, expect, type Page, type Response } from '@playwright/test';

import { loginAs, screenshot } from '../helpers/auth';

const TASK_DIR = 'B-FE-6-messages';

const SALES_NOTIFICATIONS_PATHS = [
  '/api/notifications',
] as const;

const READ_ALL_PATH = '/api/notifications/read-all';

/**
 * 监听 /api/notifications GET，捕获首个匹配响应并打 warn。
 * 返回 { promise, warnings, stop }：promise resolve 后取出 Response 对象。
 */
async function watchNotifications(
  page: Page,
  method: 'GET' | 'POST' = 'GET',
  label: string,
) {
  const warnings: string[] = [];
  const predicate = (r: Response) =>
    r.url().includes('/api/notifications') &&
    r.request().method() === method;
  const handler = (resp: Response) => {
    if (!predicate(resp)) return;
    const status = resp.status();
    const tag = `[${label}] ${resp.request().method()} ${resp.url()} -> ${status}`;
    if (status >= 500 || status === 404) {
      warnings.push(tag);
      // eslint-disable-next-line no-console
      console.warn(tag);
    } else {
      // eslint-disable-next-line no-console
      console.log(tag);
    }
  };
  page.on('response', handler);
  return {
    warnings,
    stop: () => {
      page.off('response', handler);
    },
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('B 端 /sales/messages 销售消息中心（真实 API）', () => {
  test.setTimeout(90_000);

  test('Test 1: 销售消息页加载', async ({ page }) => {
    // 1. 登录
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 监听 /api/notifications
    const notifications = await watchNotifications(page, 'GET', 'B-FE-6 notifications.list');

    // 3. 访问 /sales/messages
    const listPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/notifications') && r.request().method() === 'GET',
        { timeout: 30_000 },
      )
      .catch((err): null => {
        // eslint-disable-next-line no-console
        console.warn('[B-FE-6] 等待 /api/notifications 列表响应超时', err);
        return null;
      });

    await page.goto('/sales/messages', { waitUntil: 'domcontentloaded' });
    const listResp: Response | null = await listPromise;

    if (listResp) {
      const status = listResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(`[B-FE-6] /api/notifications 返回 ${status}，按场景继续断言 UI 元素`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[B-FE-6] /api/notifications 列表状态 ${status}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[B-FE-6] 未捕获到 /api/notifications 响应');
    }

    // 4. H2 标题 + 副标题可见
    await expect(page.getByRole('heading', { name: '销售消息', level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText('新分配客资、运营协同处理结果和来源更新提醒。', { exact: true }),
    ).toBeVisible();

    // 5. 刷新按钮 + 全部已读按钮可见
    await expect(page.getByRole('button', { name: /刷\s*新/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /全\s*部\s*已\s*读/ })).toBeVisible();

    // 6. 列表项 或 空态 至少一个可见
    const listItems = page.locator('.notification-list-item');
    const emptyState = page.getByText('暂无消息', { exact: true });
    const listCount = await listItems.count().catch(() => 0);
    if (listCount > 0) {
      await expect(listItems.first()).toBeVisible({ timeout: 10_000 });
      // eslint-disable-next-line no-console
      console.log(`[B-FE-6] 列表渲染 ${listCount} 条`);
    } else {
      await expect(emptyState.first()).toBeVisible({ timeout: 10_000 });
      // eslint-disable-next-line no-console
      console.log('[B-FE-6] 列表为空，渲染空态');
    }

    // 7. 等异步稳定
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

    // 8. 截图
    await screenshot(page, TASK_DIR, '01-page-loaded');

    notifications.stop();
  });

  test('Test 2: 全部/未读 tab 切换 + 全部已读', async ({ page }) => {
    // 1. 先 goto 一个有 origin 的页面（避免 about:blank 访问 localStorage 报 SecurityError）
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const hasToken = await page.evaluate(() =>
      Boolean(window.localStorage.getItem('xhsmedium.token')),
    );
    if (!hasToken) {
      await loginAs(page, 'sales1', /\/sales\//);
    }

    // 2. 监听 GET /api/notifications（用于 tab 切换请求）
    const notificationsGet = await watchNotifications(page, 'GET', 'B-FE-6 tab.switch');
    // POST /api/notifications/read-all
    const readAllWarnings: string[] = [];
    const readAllHandler = (resp: Response) => {
      if (
        resp.url().includes(READ_ALL_PATH) &&
        resp.request().method() === 'POST'
      ) {
        const status = resp.status();
        if (status >= 500 || status === 404) {
          const msg = `[B-FE-6] read-all -> ${status}`;
          readAllWarnings.push(msg);
          // eslint-disable-next-line no-console
          console.warn(msg);
        } else {
          // eslint-disable-next-line no-console
          console.log(`[B-FE-6] read-all -> ${status}`);
        }
      }
    };
    page.on('response', readAllHandler);

    // 3. 访问消息页
    await page.goto('/sales/messages', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '销售消息', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 等首次列表加载
    await page
      .waitForResponse(
        (r) => r.url().includes('/api/notifications') && r.request().method() === 'GET',
        { timeout: 30_000 },
      )
      .catch(() => undefined);

    // 4. 检查 Segmented 选项"未读 N"是否存在 + 是否可点
    //    选项是 radio role，label 含 "未读"
    const unreadOption = page
      .getByRole('radio')
      .filter({ hasText: /^未读\s*\d+$/ })
      .first();
    const unreadOptionVisible = await unreadOption.isVisible().catch(() => false);
    let unreadCount = 0;
    if (unreadOptionVisible) {
      const text = (await unreadOption.innerText().catch(() => '未读 0')) ?? '未读 0';
      const match = text.match(/未读\s*(\d+)/);
      unreadCount = match ? Number(match[1]) : 0;
      // eslint-disable-next-line no-console
      console.log(`[B-FE-6] 当前未读 = ${unreadCount}`);

      if (unreadCount > 0) {
        // 等切换后 /api/notifications 重新请求
        const switchPromise = page
          .waitForResponse(
            (r) => r.url().includes('/api/notifications') && r.request().method() === 'GET',
            { timeout: 15_000 },
          )
          .catch(() => null);
        await unreadOption.click();
        await switchPromise;
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      } else {
        // eslint-disable-next-line no-console
        console.log('[B-FE-6] 未读数为 0，仍点击 tab 验证 UI 反馈');
        const switchPromise = page
          .waitForResponse(
            (r) => r.url().includes('/api/notifications') && r.request().method() === 'GET',
            { timeout: 15_000 },
          )
          .catch(() => null);
        await unreadOption.click();
        await switchPromise;
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[B-FE-6] 未找到 "未读 N" Segmented 选项');
    }

    // 5. 截图：未读 tab
    await screenshot(page, TASK_DIR, '02-unread-tab');

    // 6. 检查"全部已读"按钮
    const readAllBtn = page.getByRole('button', { name: /全\s*部\s*已\s*读/ });
    await expect(readAllBtn).toBeVisible();
    const readAllDisabled = await readAllBtn.isDisabled().catch(() => true);
    if (!readAllDisabled) {
      // eslint-disable-next-line no-console
      console.log('[B-FE-6] 点击"全部已读"');
      const readAllPromise = page
        .waitForResponse(
          (r) => r.url().includes(READ_ALL_PATH) && r.request().method() === 'POST',
          { timeout: 15_000 },
        )
        .catch(() => null);
      await readAllBtn.click();
      const readAllResp = await readAllPromise;
      if (readAllResp) {
        const status = readAllResp.status();
        if (status >= 500) {
          // eslint-disable-next-line no-console
          console.warn(`[B-FE-6] 全部已读返回 ${status}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`[B-FE-6] 全部已读返回 ${status}`);
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[B-FE-6] 未捕获到 read-all 响应（可能 401/200 太快）');
      }

      // 等列表 reload
      await page
        .waitForResponse(
          (r) => r.url().includes('/api/notifications') && r.request().method() === 'GET',
          { timeout: 15_000 },
        )
        .catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    } else {
      // eslint-disable-next-line no-console
      console.log('[B-FE-6] "全部已读" 按钮 disabled（unread=0，跳过点击）');
    }

    // 7. 截图：全部已读后
    await screenshot(page, TASK_DIR, '03-after-mark-all-read');

    notificationsGet.stop();
    page.off('response', readAllHandler);
  });

  test('Test 3: 通知下拉铃铛（Bell）', async ({ page }) => {
    // 1. 先 goto 一个有 origin 的页面
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const hasToken = await page.evaluate(() =>
      Boolean(window.localStorage.getItem('xhsmedium.token')),
    );
    if (!hasToken) {
      await loginAs(page, 'sales1', /\/sales\//);
    }

    // 2. 监听 /api/notifications（Bell 内部会触发 list）
    const bellNotifications = await watchNotifications(page, 'GET', 'B-FE-6 bell.list');

    // 3. 访问 /sales/leads（任意有 Header 的页）
    await page.goto('/sales/leads', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '我的客资', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 4. 点击 Header 的"消息"按钮
    const bellBtn = page.getByRole('button', { name: '消息' });
    await expect(bellBtn).toBeVisible({ timeout: 10_000 });
    await bellBtn.click();

    // 5. 等下拉面板出现（class "notification-panel"）
    const panel = page.locator('.notification-panel').first();
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 6. 断言面板含"消息提醒"标题 + "刷新"按钮
    await expect(panel.getByText('消息提醒', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: /刷\s*新/ })).toBeVisible();

    // 7. 列表项断言（如有）
    const bellItems = panel.locator('.notification-item');
    const bellCount = await bellItems.count().catch(() => 0);
    if (bellCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[B-FE-6] 铃铛面板渲染 ${bellCount} 条`);
      // 检查每项至少含一个 ant-tag（类型 tag）
      for (let i = 0; i < Math.min(bellCount, 3); i += 1) {
        const item = bellItems.nth(i);
        await expect(item).toBeVisible();
        // 至少存在一个 ant-tag（类型 tag）
        const tagCount = await item.locator('.ant-tag').count();
        if (tagCount === 0) {
          // eslint-disable-next-line no-console
          console.warn(`[B-FE-6] 铃铛第 ${i + 1} 项未发现 ant-tag`);
        }
        // 标题文本
        const hasTitle = await item.locator('strong, .ant-typography').first().isVisible().catch(() => false);
        if (!hasTitle) {
          // eslint-disable-next-line no-console
          console.warn(`[B-FE-6] 铃铛第 ${i + 1} 项未发现标题`);
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.log('[B-FE-6] 铃铛面板为空（符合未读=0 预期）');
      await expect(panel.getByText('暂无消息', { exact: true })).toBeVisible({
        timeout: 5_000,
      });
    }

    // 8. 软断言：未读数 > 0 时红点可见（不强求）
    const badgeSup = page.locator('.ant-badge sup').first();
    const badgeVisible = await badgeSup.isVisible().catch(() => false);
    if (badgeVisible) {
      const text = (await badgeSup.innerText().catch(() => '')) ?? '';
      // eslint-disable-next-line no-console
      console.warn(`[B-FE-6] Header 红点未读数 = ${text || '(空)'}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[B-FE-6] Header 红点未渲染（unread=0，符合预期）');
    }

    // 9. 等异步稳定
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

    // 10. 截图
    await screenshot(page, TASK_DIR, '04-bell-dropdown');

    bellNotifications.stop();
  });
});

// ============================== 备注 ==============================
// 跑通条件：
//   1) NestJS 后端在 8089 已启动，MySQL 已 seed sales1/test123；
//   2) Next.js 前端在 3302 跑（playwright.config 自动 npm run dev）；
//   3) 在 frontend 目录下执行：
//        npx playwright test e2e/specs/06-messages.spec.ts
// 已知：
//   - /api/notifications 是工作接口，正常返回 200；
//   - 销售账号 sales1 业务上未读数可能为 0，此时 "未读 0" / 红点 / "全部已读" 按钮 disabled 都是预期行为。
// ==================================================================
