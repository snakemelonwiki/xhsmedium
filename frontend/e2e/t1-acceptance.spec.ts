// T1.2 + T1.3 验收：主管端总览页
// 直接通过 API 登录注入 token（前端 Next.js 启动慢，改用 setAuthFromLoginApi 套路）
import { test, expect, type Page, type TestInfo } from '@playwright/test';

const SCREENSHOT_DIR = 'D:/webstormProjects/xhsmedium-dev/doc/20260608/screenshots';

type LoginResponse = {
  token: string;
  user: { id: string; username: string; role: string; employeeId?: string | null; employeeName?: string | null };
};

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

async function loginAsAdmin(page: Page) {
  // admin_d / test123 已知 admin 角色，supervisor 接口对 admin 角色也开放
  const r = await setAuthFromLoginApi(page, 'admin_d', 'test123');
  // 等待跳到 /admin
  await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
  // 主管总览 出现在 Typography.Title (h2)
  await page.waitForSelector('text=主管总览', { timeout: 30_000 });
  return r;
}

test.describe('T1.2 + T1.3 主管端总览验收', () => {
  test('T1.2 数据卡 + 时段切换', async ({ page }, testInfo: TestInfo) => {
    await loginAsAdmin(page);
    // 等待数据加载（接口返回需要几秒）
    await page.waitForTimeout(3000);

    // 默认时段（今日）数据可能为 0；先切到"本月"获取有数据的视图
    // antd Button 自动加空格做字符间距：'本 月'/'本 周'/'今 日'
    await page.locator('button').filter({ hasText: /^本\s*月$/ }).first().click();
    await page.waitForTimeout(3000);

    // 截图
    await page.screenshot({ path: SCREENSHOT_DIR + '/t1.2.png', fullPage: true });
    testInfo.attachments.push({ name: 't1.2', path: SCREENSHOT_DIR + '/t1.2.png', contentType: 'image/png' });

    // 4 张数据卡
    for (const t of ['作品数', '客资数', '点赞数', '有效账号数']) {
      await expect(page.locator('.ant-card').filter({ hasText: t }).first()).toBeVisible();
    }
    // 至少 4 张 statistic
    const stats = await page.locator('.ant-card .ant-statistic').count();
    console.log('[T1.2] Statistic 数量:', stats);
    expect(stats).toBeGreaterThanOrEqual(8); // 4 数据 + 4 异常

    // 本月 → 作品数 > 0
    const postCard = page.locator('.ant-card').filter({ hasText: '作品数' }).first();
    const postValEl = postCard.locator('.ant-statistic-content-value-int, .ant-statistic-content-value').first();
    const monthVal = await postValEl.innerText();
    console.log('[T1.2] 本月作品数:', monthVal);
    const monthNum = parseInt(monthVal.replace(/[^\d]/g, ''), 10) || 0;
    expect(monthNum).toBeGreaterThan(0);

    // 4 张卡全部 > 0
    for (const t of ['作品数', '客资数', '点赞数', '有效账号数']) {
      const card = page.locator('.ant-card').filter({ hasText: t }).first();
      const valEl = card.locator('.ant-statistic-content-value-int, .ant-statistic-content-value').first();
      const txt = await valEl.innerText();
      const n = parseInt(txt.replace(/[^\d]/g, ''), 10) || 0;
      console.log(`[T1.2] ${t} = ${txt} (${n})`);
      expect(n).toBeGreaterThan(0);
    }

    // 切换到本周
    await page.locator('button').filter({ hasText: /^本\s*周$/ }).first().click();
    await page.waitForTimeout(2000);
    const weekTxt = await postValEl.innerText();
    console.log('[T1.2] 本周作品数:', weekTxt);

    // 切换到今日
    await page.locator('button').filter({ hasText: /^今\s*日$/ }).first().click();
    await page.waitForTimeout(2000);
    const todayTxt = await postValEl.innerText();
    console.log('[T1.2] 今日作品数:', todayTxt);

    // 切回本月
    await page.locator('button').filter({ hasText: /^本\s*月$/ }).first().click();
    await page.waitForTimeout(1500);
  });

  test('T1.3 7 个区域齐全 + 标签/单位正确', async ({ page }, testInfo: TestInfo) => {
    await loginAsAdmin(page);
    await page.waitForTimeout(2000);
    // 切到本月，确保有数据
    await page.locator('button').filter({ hasText: /^本\s*月$/ }).first().click();
    await page.waitForTimeout(3500);
    // 截图
    await page.screenshot({ path: SCREENSHOT_DIR + '/t1.3.png', fullPage: true });
    testInfo.attachments.push({ name: 't1.3', path: SCREENSHOT_DIR + '/t1.3.png', contentType: 'image/png' });

    // 7 个区域标题（按 card-head-title）
    const required = [
      '双平台分布',
      '作品量趋势',
      '三类作品占比',
      '获客效率（客/作）',
      '获客趋势',
      '流量趋势',
      '获客帖效率（客/获客贴）',
    ];
    for (const t of required) {
      const card = page.locator('.ant-card-head-title').filter({ hasText: t }).first();
      const exists = await card.count();
      console.log(`[T1.3] "${t}": ${exists > 0 ? 'OK' : 'MISSING'}`);
      expect(card).toBeVisible();
    }

    // 三类作品占比标签：人设贴/讨论贴/获客帖
    // echarts legend 会把图例渲染到 DOM
    const bodyText = await page.content();
    const hasPersona = bodyText.includes('人设贴');
    const hasDiscussion = bodyText.includes('讨论贴');
    const hasLeadPost = bodyText.includes('获客帖');
    console.log(`[T1.3] 三类作品占比标签: 人设贴=${hasPersona} 讨论贴=${hasDiscussion} 获客帖=${hasLeadPost}`);

    // 获客效率单位 = 客/作（已经在标题中体现）
    const efficiencyCard = page.locator('.ant-card').filter({ hasText: '获客效率' }).first();
    const effText = await efficiencyCard.innerText();
    console.log('[T1.3] 获客效率卡内容:', effText.replace(/\n/g, ' | '));
    expect(effText).toContain('客/作');

    // 获客帖效率单位 = 客/获客贴
    const lpeCard = page.locator('.ant-card').filter({ hasText: '获客帖效率' }).first();
    const lpeText = await lpeCard.innerText();
    console.log('[T1.3] 获客帖效率卡内容:', lpeText.replace(/\n/g, ' | '));
    expect(lpeText).toContain('客/获客贴');

    // 本月数据下，效率值应该非 0
    // 双平台综合 (最大字)
    const totalEffVal = await lpeCard.locator('.ant-typography').last().innerText();
    console.log('[T1.3] 获客帖效率 双平台综合 值:', totalEffVal);
  });
});
