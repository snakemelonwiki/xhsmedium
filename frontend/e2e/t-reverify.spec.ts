// T1.2 + T3.4 + T4.3 重验脚本
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
  const r = await setAuthFromLoginApi(page, 'admin_d', 'test123');
  return r;
}

async function captureApi(page: Page, path: string) {
  const token = await page.evaluate(() => window.localStorage.getItem('xhsmedium.token'));
  const resp = await page.request.get(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: resp.status(), body: await resp.json().catch(() => ({})) };
}

test.describe('T1.2/T3.4/T4.3 重验', () => {
  test('T1.2 重验: 本周/本月 to 字段', async ({ page }, testInfo: TestInfo) => {
    await loginAsAdmin(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=主管总览', { timeout: 30_000 });
    await page.waitForTimeout(2000);

    // 接口验证 thisWeek
    const weekApi = await captureApi(page, '/api/dashboard/supervisor/overview?period=thisWeek');
    console.log('[T1.2] API thisWeek:', JSON.stringify(weekApi.body.period));
    expect(weekApi.body.period.from).toBe('2026-06-08');
    expect(weekApi.body.period.to).toBe('2026-06-14');

    // 接口验证 thisMonth
    const monthApi = await captureApi(page, '/api/dashboard/supervisor/overview?period=thisMonth');
    console.log('[T1.2] API thisMonth:', JSON.stringify(monthApi.body.period));
    expect(monthApi.body.period.from).toBe('2026-06-01');
    expect(monthApi.body.period.to).toBe('2026-06-30');

    // 切到本周
    await page.locator('button').filter({ hasText: /^本\s*周$/ }).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t1.2-v2.png', fullPage: true });
    testInfo.attachments.push({ name: 't1.2-v2', path: SCREENSHOT_DIR + '/t1.2-v2.png', contentType: 'image/png' });

    // 切到本月
    await page.locator('button').filter({ hasText: /^本\s*月$/ }).first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t1.2-v2-month.png', fullPage: true });
    testInfo.attachments.push({ name: 't1.2-v2-month', path: SCREENSHOT_DIR + '/t1.2-v2-month.png', contentType: 'image/png' });
  });

  test('T3.4 重验: 个人看板标题', async ({ page }, testInfo: TestInfo) => {
    await loginAsAdmin(page);
    await page.goto('/admin/personal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 选择员工 EMP0007 龚蓉
    // antd Select 触发方式：点击 Select 容器
    const employeeSelect = page.locator('.ant-select').first();
    await employeeSelect.click();
    await page.waitForTimeout(800);
    // 输入筛选
    await page.keyboard.type('龚蓉');
    await page.waitForTimeout(800);
    // 选中下拉项
    const option = page.locator('.ant-select-item-option').filter({ hasText: '龚蓉' }).first();
    await option.click();
    await page.waitForTimeout(3000);

    // 截图整页
    await page.screenshot({ path: SCREENSHOT_DIR + '/t3.4-v2.png', fullPage: true });
    testInfo.attachments.push({ name: 't3.4-v2', path: SCREENSHOT_DIR + '/t3.4-v2.png', contentType: 'image/png' });

    // 页面包含"账号流量榜 Top 8"或类似 Top 8 表格
    const bodyText = await page.content();
    const hasAccountTraffic = bodyText.includes('账号流量榜');
    const hasOldTitle = bodyText.includes('获客数榜');
    console.log('[T3.4] "账号流量榜"存在:', hasAccountTraffic, '旧"获客数榜"存在:', hasOldTitle);

    // 检查所有 Top 8 标题
    const allHeadings = await page.locator('.ant-card-head-title, .ant-typography, h2, h3, h4, .ant-table-title').allInnerTexts();
    console.log('[T3.4] 页面所有标题:', allHeadings.join(' | '));

    // 期望至少 1 个"账号流量榜"
    expect(hasAccountTraffic, '应包含"账号流量榜"').toBeTruthy();
    // 期望没有"获客数榜"
    expect(hasOldTitle, '不应再含"获客数榜"').toBeFalsy();
  });

  test('T4.3 重验: 账号下拉字段映射', async ({ page }, testInfo: TestInfo) => {
    await loginAsAdmin(page);

    // 接口验证 accountName
    const accApi = await captureApi(page, '/api/accounts?limit=200');
    const items = accApi.body.items || accApi.body || [];
    console.log('[T4.3] accounts API 返回条数:', items.length);
    expect(items.length).toBeGreaterThan(180);

    // 检查 accountName 字段
    const namesWithName = items.filter((a: any) => a.accountName && a.accountName.length > 0);
    const nameSamples = namesWithName.slice(0, 5).map((a: any) => `${a.accountName} (${a.platform || 'unknown'})`);
    console.log('[T4.3] 前 5 个 accountName:', nameSamples.join(' | '));

    // 检查是否有"青松果"
    const qingsongguo = items.filter((a: any) => a.accountName && a.accountName.includes('青松果'));
    console.log('[T4.3] "青松果"出现次数:', qingsongguo.length, 'platforms:', qingsongguo.map((a: any) => a.platform).join(','));

    // 页面验证
    await page.goto('/admin/posts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t4.3-v2.png', fullPage: true });
    testInfo.attachments.push({ name: 't4.3-v2', path: SCREENSHOT_DIR + '/t4.3-v2.png', contentType: 'image/png' });

    // 找到账号下拉（placeholder 为"账号"）
    const accountSelect = page.locator('.ant-select').filter({ hasText: '账号' }).first();
    await accountSelect.click();
    await page.waitForTimeout(2000);

    // 收集所有下拉项的 label 文本
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').first();
    const optionTexts = await dropdown.locator('.ant-select-item-option-content').allInnerTexts();
    console.log('[T4.3] 下拉项总数:', optionTexts.length);
    console.log('[T4.3] 前 10 个下拉项:', optionTexts.slice(0, 10).join(' | '));

    // 搜索"青松果"看 label
    await page.keyboard.type('青松果');
    await page.waitForTimeout(1500);
    const filteredTexts = await dropdown.locator('.ant-select-item-option-content').allInnerTexts();
    console.log('[T4.3] 搜"青松果"后下拉项:', filteredTexts.join(' | '));

    // 验证：搜"青松果"应出现带平台后缀的 label
    const hasQingsongguoXHS = filteredTexts.some((t) => t.includes('青松果（小红书）'));
    const hasQingsongguoDY = filteredTexts.some((t) => t.includes('青松果（抖音）'));
    console.log('[T4.3] "青松果（小红书）":', hasQingsongguoXHS, '"青松果（抖音）":', hasQingsongguoDY);

    expect(filteredTexts.length, '搜"青松果"应至少 2 个结果（小红书+抖音）').toBeGreaterThanOrEqual(2);
    expect(hasQingsongguoXHS || hasQingsongguoDY, '重复名应带平台后缀').toBeTruthy();

    await page.screenshot({ path: SCREENSHOT_DIR + '/t4.3-v2-dropdown.png', fullPage: true });
    testInfo.attachments.push({ name: 't4.3-v2-dropdown', path: SCREENSHOT_DIR + '/t4.3-v2-dropdown.png', contentType: 'image/png' });

    // 关闭下拉
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });
});
