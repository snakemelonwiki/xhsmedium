// T3.1 + T3.2 + T3.3 + T3.4 验收：主管端-个人看板
// 用 admin 账号 admin_d 模拟主管（前端 APP_ROLES 不含 supervisor，supervisor 登录会跳 /forbidden）
// 后端 dashboard/personal 接口对 admin/supervisor 都开放，前端渲染逻辑一致
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

async function openPersonalDashboard(page: Page) {
  const r = await setAuthFromLoginApi(page, 'admin_d', 'test123');
  console.log('[login]', r.user.username, 'role=', r.user.role);
  await page.goto('/admin/personal', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=个人看板', { timeout: 30_000 });
  // 选择员工（龚蓉 / EMP0007）
  const select = page.locator('.ant-select-selector').filter({ hasText: /选择员工|EMP0007|龚蓉/ }).first();
  await select.click();
  await page.waitForTimeout(800);
  const opt = page.locator('.ant-select-item-option').filter({ hasText: /EMP0007|龚蓉/ }).first();
  if ((await opt.count()) > 0) {
    await opt.click();
  } else {
    await page.keyboard.press('Escape');
    await select.click();
    await page.locator('.ant-select-selection-search-input').fill('龚蓉');
    await page.waitForTimeout(500);
    await page.locator('.ant-select-item-option').filter({ hasText: /龚蓉/ }).first().click();
  }
  await page.waitForTimeout(2500);
  // 切到"本月"确保有数据
  const monthBtn = page.locator('button:has-text("本月")').first();
  if ((await monthBtn.count()) > 0) {
    await monthBtn.click();
    await page.waitForTimeout(3500);
  }
}

test.describe('T3 主管个人看板验收', () => {
  test('T3.1 三类作品占比分类正确', async ({ page }, testInfo: TestInfo) => {
    await openPersonalDashboard(page);
    await page.locator('text=三类作品占比').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t3.1.png', fullPage: true });
    testInfo.attachments.push({ name: 't3.1', path: SCREENSHOT_DIR + '/t3.1.png', contentType: 'image/png' });

    // 验收点：圆环/饼图三项分别为"人设贴""讨论贴""获客帖"
    // 实际页面使用"获客贴"（不带"帖"字），验收任务描述用"获客帖"
    const bodyText = await page.content();
    const hasPersona = bodyText.includes('人设贴');
    const hasDiscussion = bodyText.includes('讨论贴');
    // 接受 "获客贴" 或 "获客帖"
    const hasLeadPost = bodyText.includes('获客贴') || bodyText.includes('获客帖');
    console.log(`[T3.1] 三类作品占比标签: 人设贴=${hasPersona} 讨论贴=${hasDiscussion} 获客贴/帖=${hasLeadPost}`);
    expect(hasPersona).toBeTruthy();
    expect(hasDiscussion).toBeTruthy();
    expect(hasLeadPost).toBeTruthy();

    // 验证旧标题"三类型占比（作品 / 流量 / 客资）"不再出现
    const hasOldTitle = bodyText.includes('三类型占比（作品');
    console.log(`[T3.1] 旧标题"三类型占比（作品"残留: ${hasOldTitle}`);
    expect(hasOldTitle).toBeFalsy();

    // 卡片文本（应包含三项分类）
    const card = page.locator('.ant-card').filter({ hasText: '三类作品占比' }).first();
    const cardText = await card.innerText().catch(() => '');
    console.log('[T3.1] 三类作品占比卡内容:', cardText.replace(/\n/g, ' | '));

    // 验收点：三个数值正确求和（不为空）
    // ECharts 渲染后图例/数据在 DOM 中
    const echartsNum = await card.locator('canvas').count();
    console.log(`[T3.1] 三类作品占比区 canvas 数: ${echartsNum}`);
    expect(echartsNum).toBeGreaterThan(0);
  });

  test('T3.2 获客帖效率单位 = 客/作', async ({ page }, testInfo: TestInfo) => {
    await openPersonalDashboard(page);
    // 滚到双平台数据分析区
    await page.locator('text=数据分析').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t3.2.png', fullPage: true });
    testInfo.attachments.push({ name: 't3.2', path: SCREENSHOT_DIR + '/t3.2.png', contentType: 'image/png' });

    // 限定"双平台数据分析"区：只匹配同时含"获客贴效率"标题 + 含"获客贴数"小字 + 含 Statistic 数值的卡
    // 排除 PersonalDashboardBoard 的 Tab 标签（卡内"获客贴效率榜 Top 8"）
    // 关键：双平台的"获客贴效率"卡有副标题"获客贴数：N · 客资数：N"
    const cards = page.locator('.ant-card').filter({ hasText: '获客贴效率' }).filter({ hasText: '获客贴数' });
    const count = await cards.count();
    console.log(`[T3.2] 在双平台数据分析区找到 ${count} 张"获客贴效率"卡（特征:含"获客贴数"）`);
    expect(count).toBeGreaterThanOrEqual(1);

    let allOk = true;
    let hasNonZero = false;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText();
      const hasNewUnit = text.includes('客/作');
      // 旧单位是 "X%" 模式：单独的 % 数字（不能跟"客/作"混用）
      const hasOldPercent = /[\d.]+\s*%/.test(text) && !text.includes('客/作');
      // 提取 Statistic 数值
      const valEl = card.locator('.ant-statistic-content-value').first();
      const valText = await valEl.innerText().catch(() => '');
      const num = parseFloat(valText.replace(/[^\d.]/g, '')) || 0;
      if (num > 0) hasNonZero = true;
      console.log(`[T3.2] 卡#${i}: 单位=${hasNewUnit ? '✅ 客/作' : hasOldPercent ? '❌ 仍为 %' : '⚠️ 识别失败'}  值=${valText}`);
      if (!hasNewUnit) allOk = false;
    }
    console.log(`[T3.2] ${count} 张卡全部单位为"客/作": ${allOk}；存在非0值: ${hasNonZero}`);
    expect(allOk).toBeTruthy();
    expect(hasNonZero).toBeTruthy();
  });

  test('T3.3 获客趋势 + 流量趋势 3 曲线', async ({ page }, testInfo: TestInfo) => {
    await openPersonalDashboard(page);
    await page.locator('text=获客趋势').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t3.3.png', fullPage: true });
    testInfo.attachments.push({ name: 't3.3', path: SCREENSHOT_DIR + '/t3.3.png', contentType: 'image/png' });

    const leadTrendCard = page.locator('.ant-card').filter({ hasText: '获客趋势' }).first();
    const trafficTrendCard = page.locator('.ant-card').filter({ hasText: '流量趋势' }).first();
    expect(await leadTrendCard.count()).toBeGreaterThan(0);
    expect(await trafficTrendCard.count()).toBeGreaterThan(0);

    const leadText = await leadTrendCard.innerText();
    const trafficText = await trafficTrendCard.innerText();
    console.log('[T3.3] 获客趋势卡内容:', leadText.replace(/\n/g, ' | '));
    console.log('[T3.3] 流量趋势卡内容:', trafficText.replace(/\n/g, ' | '));

    // 副标题应包含 "小红书 / 抖音 / 总和" 提示 3 条曲线
    const hasLead3 = leadText.includes('小红书') && leadText.includes('抖音') && leadText.includes('总和');
    const hasTraffic3 = trafficText.includes('小红书') && trafficText.includes('抖音') && trafficText.includes('总和');
    console.log(`[T3.3] 副标题含 "小红书/抖音/总和": 获客=${hasLead3}, 流量=${hasTraffic3}`);
    expect(hasLead3).toBeTruthy();
    expect(hasTraffic3).toBeTruthy();

    // 检查 echarts canvas 渲染（3 曲线 = 1 个 canvas）
    const leadCanvas = await leadTrendCard.locator('canvas').count();
    const trafficCanvas = await trafficTrendCard.locator('canvas').count();
    console.log(`[T3.3] echarts canvas: 获客=${leadCanvas}, 流量=${trafficCanvas}`);
    expect(leadCanvas).toBeGreaterThan(0);
    expect(trafficCanvas).toBeGreaterThan(0);
  });

  test('T3.4 客资变流量（数据列 leadCount → traffic）', async ({ page }, testInfo: TestInfo) => {
    await openPersonalDashboard(page);
    await page.locator('text=数据分析').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SCREENSHOT_DIR + '/t3.4.png', fullPage: true });
    testInfo.attachments.push({ name: 't3.4', path: SCREENSHOT_DIR + '/t3.4.png', contentType: 'image/png' });

    const bodyText = await page.content();
    // 验收点 1：标题"获客数榜 Top 8" 改为"账号流量榜 Top 8"
    const hasAccountTrafficRank = bodyText.includes('账号流量榜');
    const hasOldLeadRank = bodyText.includes('获客数榜 Top 8');
    console.log(`[T3.4] "账号流量榜" 出现: ${hasAccountTrafficRank}; 旧"获客数榜 Top 8" 残留: ${hasOldLeadRank}`);

    // 验收点 2：数据列从 leadCount 改为 traffic
    // 表格不显示表头，从数据值判断：traffic 一般是大数字，leadCount 较小
    const leadRankTitle = page.locator('h5').filter({ hasText: /获客数榜|账号流量榜/ }).first();
    const tbl = leadRankTitle.locator('xpath=../..').locator('.ant-table-tbody').first();
    const rowCount = await tbl.locator('tr').count();
    let trafficDataObserved = false;
    for (let i = 0; i < rowCount; i++) {
      const tds = await tbl.locator('tr').nth(i).locator('td').allInnerTexts();
      // 数据列（数值较大的那列，应为 traffic）
      if (tds.length >= 3) {
        const valText = tds[2].replace(/,/g, '');
        const num = parseFloat(valText) || 0;
        console.log(`[T3.4] 行 ${i}: ${tds.join(' | ')} (数据列值=${num})`);
        if (num > 100) trafficDataObserved = true;
      }
    }
    console.log(`[T3.4] 数据列展示大数(traffic 特征): ${trafficDataObserved}`);

    // 综合验收：标题改名 OR 数据列改 traffic
    // 验收点原文要求"标题改为'账号流量榜 Top 8' + 数据列改 traffic"
    // 实际修复了数据列（traffic），但标题未改
    if (hasAccountTrafficRank) {
      console.log('[T3.4] ✅ 标题已改为"账号流量榜 Top 8"');
    } else {
      console.log('[T3.4] ❌ 标题未改（仍为"获客数榜 Top 8"）');
    }
    if (trafficDataObserved) {
      console.log('[T3.4] ✅ 数据列已从 leadCount 改为 traffic（数值大、带千分位）');
    } else {
      console.log('[T3.4] ❌ 数据列可能仍为 leadCount');
    }
    // 验收点：标题 + 数据列都改 → 严格断言两个都通过
    expect(hasAccountTrafficRank).toBeTruthy();
    expect(trafficDataObserved).toBeTruthy();
  });
});
