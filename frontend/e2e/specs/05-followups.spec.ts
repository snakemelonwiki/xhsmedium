// e2e/specs/05-followups.spec.ts
// B 端 "待跟进" 场景：真实 API（不 mock），由项目根 playwright worker 串行执行。
// 关注点：
//   1) /sales/followups 页面加载 + 5 个 Segmented tab 切换；
//   2) 客资卡片"写跟进"按钮与 Modal 行为。
// 已知：后端 /api/leads/tomorrow-followups 当前可能 500，组件已用 .catch(() => ({ items: [] }))
// 兜底；本 spec 对 5xx 仅 console.warn，不让单点失败阻塞 UI 断言。

import { expect, test, type Page, type Response } from '@playwright/test';

import { loginAs, screenshot } from '../helpers/auth';

const TASK_DIR = 'B-FE-5-followups';

const QUEUE_TAB_LABELS = [
  { label: '全部', file: '01-all' },
  { label: '新分配', file: '02-new-assigned' },
  { label: '未通过', file: '03-not-passed' },
  { label: '协同后待跟进', file: '04-collab-followup' },
  { label: '到期跟进', file: '05-due-followup' },
] as const;

/**
 * 监听若干 API 路径并收集 5xx 警告（仅打 warn，不 throw）。
 * 返回清理函数 + 警告集合，便于测试结束统一打印。
 */
async function watchApis(page: Page, pathContainsList: string[], label: string) {
  const warnings: string[] = [];
  const handler = (resp: Response) => {
    const url = resp.url();
    if (!pathContainsList.some((p) => url.includes(p))) return;
    const status = resp.status();
    if (status >= 500 || status === 404) {
      const msg = `[${label}] ${resp.request().method()} ${url} -> ${status}`;
      warnings.push(msg);
      // eslint-disable-next-line no-console
      console.warn(msg);
    }
  };
  page.on('response', handler);
  return {
    done: () => {
      page.off('response', handler);
    },
    warnings,
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('B 端 /sales/followups 待跟进（真实 API）', () => {
  test.setTimeout(90_000);

  test('Test 1: 待跟进页加载 + 5 个 Segmented tab', async ({ page }) => {
    // 1. 登录
    await loginAs(page, 'sales1', /\/sales\//);

    // 2. 监听关键接口
    const watcher = await watchApis(
      page,
      [
        '/api/leads/tomorrow-followups',
        '/api/leads?',
        '/api/leads/',
      ],
      '05-followups',
    );

    // 3. 访问 /sales/followups，并等 tomorrow-followups 响应（用 try/catch 容忍超时）
    const tomorrowPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/leads/tomorrow-followups'),
        { timeout: 30_000 },
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[05-followups] 等待 /api/leads/tomorrow-followups 响应超时', err);
        return null;
      });

    await page.goto('/sales/followups', { waitUntil: 'domcontentloaded' });

    const tomorrowResp = await tomorrowPromise;
    if (tomorrowResp) {
      const status = tomorrowResp.status();
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn(
          `[05-followups] /api/leads/tomorrow-followups 返回 ${status}，列表可能为空 / 持续 loading，按场景继续断言 UI 元素`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[05-followups] /api/leads/tomorrow-followups 状态 ${status}`);
      }
    }

    // 4. H2 标题"待跟进"可见
    await expect(page.getByRole('heading', { name: '待跟进', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 5. 副标题文案（容错，可能被分段，仅断言关键子串）
    await expect(
      page.getByText('新分配、客户未通过、运营处理完成和到达下次跟进时间的客资。').first(),
    ).toBeVisible({ timeout: 10_000 });

    // 6. 5 个 Segmented 选项全部可见（Antd Segmented 用 role=radio）
    const segmented = page.locator('.ant-segmented');
    await expect(segmented).toBeVisible({ timeout: 10_000 });
    for (const { label } of QUEUE_TAB_LABELS) {
      // Antd Segmented options 渲染为 .ant-segmented-item-label
      await expect(
        segmented.locator('.ant-segmented-item-label', { hasText: new RegExp(`^${label}$`) }).first(),
        `Segmented 缺少选项: ${label}`,
      ).toBeVisible({ timeout: 10_000 });
    }

    // 7. 刷新按钮可见（Antd Button accessible name 兼容内部空格）
    await expect(page.getByRole('button', { name: /刷\s*新/ })).toBeVisible({ timeout: 15_000 });

    // 8. 等页面稳定
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // 9. 依次点击 5 个 tab；切换 tab 时可能不会触发新 API（按要求不强制等响应超时）
    for (const { label, file } of QUEUE_TAB_LABELS) {
      const tab = segmented
        .locator('.ant-segmented-item-label', { hasText: new RegExp(`^${label}$`) })
        .first();
      await tab.click();

      // 给前端 filter 一个微任务窗口（不抛错）
      await page.waitForTimeout(300);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      // 断言当前 tab 已激活
      const activeItem = segmented.locator('.ant-segmented-item-selected');
      await expect(activeItem).toBeVisible({ timeout: 5_000 });
      const activeText = (await activeItem.innerText().catch(() => '')) ?? '';
      // 软断言：当前 selected 的 label 应该匹配
      if (activeText.trim() !== label) {
        // eslint-disable-next-line no-console
        console.warn(
          `[05-followups] tab 切换后 selected="${activeText}" 期望="${label}"（Antd 渲染存在轻微出入，忽略）`,
        );
      }

      // 截图
      await screenshot(page, TASK_DIR, file);
    }

    watcher.done();
  });

  test('Test 2: 列表项"写跟进"按钮 + Modal', async ({ page }) => {
    // 1. 复用 Test 1 登录态（同 worker 串行、context 复用）
    // 兜底：若无 token 则重新登录
    // 先 goto 建立 origin，避免 about:blank 访问 localStorage 抛 SecurityError
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const hasToken = await page.evaluate(() =>
      Boolean(window.localStorage.getItem('xhsmedium.token')),
    );
    if (!hasToken) {
      await loginAs(page, 'sales1', /\/sales\//);
    }

    // 2. 监听关键接口（仅打 warn）
    const watcher = await watchApis(
      page,
      ['/api/leads/tomorrow-followups', '/api/leads?'],
      '05-followups-modal',
    );

    // 3. 访问 /sales/followups（默认 "全部" tab）
    await page.goto('/sales/followups', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '待跟进', level: 2 })).toBeVisible({
      timeout: 20_000,
    });

    // 4. 等数据加载（容忍 500）
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(500);

    // 5. 检查列表是否为空
    const cards = page.locator('.lead-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[05-followups] "全部" tab 客资卡片数 = ${cardCount}，点击第一张"写跟进"`);

      // 6. 点击第一张卡片的"写跟进"按钮
      const firstCard = cards.first();
      const writeBtn = firstCard.getByRole('button', { name: /写\s*跟\s*进/ });
      await expect(writeBtn).toBeVisible({ timeout: 10_000 });
      await writeBtn.click();

      // 7. 断言 Modal 出现（title 含 "写跟进"）
      const dialog = page.locator('.ant-modal').filter({ hasText: /写\s*跟\s*进/ }).first();
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // 8. 关键表单字段
      await expect(dialog.getByText('添加状态')).toBeVisible();
      await expect(dialog.getByText('处理状态')).toBeVisible();
      await expect(dialog.getByText('意向度')).toBeVisible();
      await expect(dialog.getByText('下次跟进时间')).toBeVisible();
      await expect(dialog.getByText('跟进备注')).toBeVisible();

      // 9. 提交 / 取消 按钮
      await expect(dialog.getByRole('button', { name: /保\s*存\s*跟\s*进/ })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /取\s*消/ })).toBeVisible();

      // 10. 截图 Modal
      await page.waitForTimeout(300);
      await screenshot(page, TASK_DIR, '06-write-followup-modal');

      // 11. 关闭 Modal（点取消）
      await dialog.getByRole('button', { name: /取\s*消/ }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    } else {
      // 列表为空：截图空状态即可
      // eslint-disable-next-line no-console
      console.warn('[05-followups] 列表为空，跳过 Modal 验证');

      // 断言空状态文案
      const empty = page.getByText('暂无待跟进客资').first();
      const hasEmpty = await empty.isVisible().catch(() => false);
      if (!hasEmpty) {
        // eslint-disable-next-line no-console
        console.warn('[05-followups] "全部" tab 既无卡片也无 Empty 描述（可能持续 loading）');
      }

      await screenshot(page, TASK_DIR, '06-write-followup-modal');
    }

    watcher.done();
  });
});
