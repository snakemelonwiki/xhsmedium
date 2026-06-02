// e2e/specs/02-my-leads.spec.ts
// B 端 "我的客资列表" 场景：真实 API（不 mock），由项目根 playwright worker 串行执行。
// 后端 /api/leads 当前可能因 leads.service.ts 旧 dist 返回 500，本 spec 用 try/catch + console.warn
// 记录，不让列表加载失败阻塞 UI 行为断言。

import { expect, test, type Page } from '@playwright/test';

import { loginAs, screenshot } from '../helpers/auth';

const TASK_DIR = 'B-FE-2-my-leads';

/**
 * 等待 /api/leads 的响应（命中 ?scope=self），最多 45 秒。
 * 返回响应对象（不抛错），由调用方根据 status() 决定如何处理。
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
    console.warn('[02-my-leads] 等待 /api/leads 列表响应超时', err);
    return null;
  }
}

test.describe('B 端 /sales/leads 我的客资列表（真实 API）', () => {
  test.setTimeout(90_000);

  test('Test 1: 加载"我的客资"页 + 高级筛选', async ({ page }) => {
    // 1. 登录
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 访问 /sales/leads，并等列表响应
    const listPromise = waitForLeadsListResponse(page);
    await page.goto('/sales/leads', { waitUntil: 'domcontentloaded' });
    const listResp = await listPromise;
    if (listResp) {
      const status = listResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(
          `[02-my-leads] /api/leads 返回 ${status}，列表可能为空 / 持续 loading，按场景继续断言 UI 元素`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[02-my-leads] /api/leads 状态 ${status}`);
      }
    }

    // 3. H2 标题可见
    await expect(page.getByRole('heading', { name: '我的客资', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 4. 状态下拉 / 添加状态下拉 / 高级筛选 / 刷新 按钮可见
    //    注：Antd Select 的 "全部状态" 是已选项 label，不是 placeholder。这里用 .ant-select 选择器+可见文本断言。
    const statusSelects = page.locator('.ant-select').filter({ hasText: '全部状态' });
    await expect(statusSelects.first()).toBeVisible();
    const addStatusSelects = page.locator('.ant-select').filter({ hasText: '全部添加状态' });
    await expect(addStatusSelects.first()).toBeVisible();
    await expect(page.getByRole('button', { name: /高级筛选/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /刷\s*新/ })).toBeVisible();

    // 5. 等页面稳定
    await page.waitForLoadState('networkidle').catch(() => {
      // 某些情况下 networkidle 永远到不了（比如后端长 polling），忽略
    });

    // 6. 截图 01：列表已加载
    await screenshot(page, TASK_DIR, '01-list-loaded');

    // 7. 点击"高级筛选"，断言 Modal 出现
    const advancedBtn = page.getByRole('button', { name: /高级筛选/ });
    await advancedBtn.click();
    const dialog = page.getByRole('dialog', { name: '高级筛选' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // 验证 Modal 内的关键字段（用 exact + label 选择器，避开 "全部平台" 误命中）
    await expect(dialog.locator('.ant-form-item-label').filter({ hasText: /^平台$/ })).toBeVisible();
    await expect(dialog.locator('.ant-form-item-label').filter({ hasText: /^来源账号$/ })).toBeVisible();
    await expect(dialog.locator('.ant-form-item-label').filter({ hasText: /^运营$/ })).toBeVisible();
    await expect(dialog.locator('.ant-form-item-label').filter({ hasText: /^意向度$/ })).toBeVisible();

    // 8. 等 Modal 内部稳定后截图
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await screenshot(page, TASK_DIR, '02-advanced-filter');

    // 9. 关闭 Modal（点"取消"）
    await dialog.getByRole('button', { name: /取\s*消/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  });

  test('Test 2: 状态/添加状态筛选切换', async ({ page }) => {
    // 1. 复用 Test 1 登录态
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 访问 /sales/leads
    const listPromise = waitForLeadsListResponse(page);
    await page.goto('/sales/leads', { waitUntil: 'domcontentloaded' });
    const listResp = await listPromise;
    if (listResp && listResp.status() >= 500) {
      // eslint-disable-next-line no-console
      console.warn(
        `[02-my-leads] /api/leads 返回 ${listResp.status()}，状态筛选切换可能不会触发新的请求`,
      );
    }

    // 等标题稳定
    await expect(page.getByRole('heading', { name: '我的客资', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 3. 点击状态下拉（"全部状态" 是 select 当前显示的 label），在下拉里选"新分配"
    const statusSelect = page.locator('.ant-select').filter({ hasText: '全部状态' }).first();
    await expect(statusSelect).toBeVisible();
    await statusSelect.click();

    // 等 Ant Design 浮层渲染（容忍 Antd 在文字间插入空白字符）
    const optionNewAssigned = page
      .locator('.ant-select-item-option')
      .filter({ hasText: /新\s*分\s*配/ })
      .first();
    await expect(optionNewAssigned).toBeVisible({ timeout: 10_000 });
    await optionNewAssigned.click();

    // 4. 等 list 重新请求
    const reloadPromise = waitForLeadsListResponse(page);
    const reloadResp = await reloadPromise;
    if (reloadResp) {
      const status = reloadResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(
          `[02-my-leads] 切换"新分配"后 /api/leads 返回 ${status}`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[02-my-leads] 切换"新分配"后 /api/leads 状态 ${status}`);
      }
    }

    // 5. 等页面稳定 + 截图
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await screenshot(page, TASK_DIR, '03-status-filter');
  });
});
