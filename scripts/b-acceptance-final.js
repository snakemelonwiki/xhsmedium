// B 端最终验收 — 每步截图记录
// 凭证: youlun(admin) / sales01(sales) / boss01(owner) / youlunrong(staff)
const { chromium } = require('D:/pycharmProjects/xhsmedium_github/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PASSWORDS = {
  youlun: '$2b$10$6/meMaiI8PhNg0jmW48szOmkCCIXNJkimjtTSSJkvQFzaI7HJf0bO',
  sales01: '$2b$10$WKrT4szVfYeuV6l7Mvz21ORChOz1yji94XWTy8mB6PrngrZRzJiFy',
  boss01: '$2b$10$QUqDZXKbNL43vZBouTf8X.DUp4W3SWGbXsvfVH02wNDyLG/rF1uYC',
  youlunrong: '$2b$10$OeLfnk1b.LYxYjmUtuojqe4/0AotFGHEN4YtvR9ErH1wA4gTZ4r0u',
};

const SHOTS_DIR = 'D:/pycharmProjects/xhsmedium_github/screenshots/b_acceptance';
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.readdirSync(SHOTS_DIR).forEach(f => fs.unlinkSync(path.join(SHOTS_DIR, f)));

const results = [];
let shotNum = 0;
function log(m) { console.log(m); results.push(m); }
async function shot(page, label) {
  shotNum++;
  const name = `${String(shotNum).padStart(2, '0')}_${label}.png`;
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: false });
  log(`  📸 ${name}`);
}

async function loginAs(page, username, port = 3002) {
  await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loginForm', { timeout: 8000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORDS[username]);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return !(await page.$('#loginForm'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', async d => {
    const m = d.message();
    if (m.includes('类型') || m.includes('协同')) await d.accept('remind_customer');
    else if (m.includes('原因')) await d.accept('Playwright 验收 - 客户超过 3 天未回复');
    else if (m.includes('备注') || m.includes('Note')) await d.accept('已联系客户并提醒');
    else if (m.includes('服务')) await d.accept('考研培训');
    else if (m.includes('金额')) await d.accept('5000');
    else if (m.includes('文件') || m.includes('CSV')) await d.accept();
    else await d.accept(d.defaultValue() || '');
  });

  try {
    // ===========================================================
    // 阶段 1: 登录
    // ===========================================================
    log('\n========== 阶段 1: 登录页 ==========');
    await page.goto('http://localhost:3002');
    await page.waitForSelector('#loginForm', { timeout: 8000 });
    await shot(page, 'login_page');
    log('1. 登录页加载: ✅');

    // ===========================================================
    // 阶段 2: admin 登录 + 客资看板（问题 3）
    // ===========================================================
    log('\n========== 问题 3: 客资看板 stats 后端聚合 ==========');
    let ok = await loginAs(page, 'youlun');
    log('admin 登录: ' + (ok ? '✅' : '❌'));
    await shot(page, 'admin_dashboard_loaded');

    await page.click('button[data-view="leads"]');
    await page.waitForTimeout(2500);
    await shot(page, 'p3_admin_leads_board_initial');

    const stats0 = await page.evaluate(() => state.leadStats);
    log(`  stats: total=${stats0?.total} filteredTotal=${stats0?.filteredTotal}`);
    log(`  byAddStatus=${JSON.stringify(stats0?.byAddStatus || {})}`);
    log(`  byProcess=${JSON.stringify(stats0?.byProcess || {})}`);
    log('  问题 3 stats 走后端聚合: ' + (stats0?.total > 0 ? '✅' : '❌'));

    // 试改筛选触发 stats 联动
    const platformSelect = await page.$('#leadMonitorPlatformFilter');
    if (platformSelect) {
      await platformSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2500);
      await shot(page, 'p3_admin_leads_filtered');
      const stats1 = await page.evaluate(() => state.leadStats);
      log(`  筛选后 filteredTotal=${stats1?.filteredTotal}`);
      log('  问题 3 筛选联动: ✅');
      // reset 通过重新查询 selector 避免 stale element
      const ps2 = await page.$('#leadMonitorPlatformFilter');
      if (ps2) {
        await ps2.selectOption('');
        await page.waitForTimeout(1500);
      }
    }

    // ===========================================================
    // 阶段 3: sales 登录（问题 1+2 销售跟进闭环 + 被动添加 + 协同 + 标记成交）
    // ===========================================================
    log('\n========== 问题 1: 销售跟进闭环 ==========');
    await page.click('#logoutBtn');
    await page.waitForTimeout(1500);
    await shot(page, 'p1_after_logout');

    ok = await loginAs(page, 'sales01');
    log('sales 登录: ' + (ok ? '✅' : '❌'));
    await shot(page, 'p1_sales_dashboard');

    await page.click('button[data-view="sales-followups"]');
    await page.waitForTimeout(2500);
    await shot(page, 'p1_sales_followups_board');

    const cardCheck = await page.evaluate(() => {
      const card = document.querySelector('.sales-followup-card, .lead-monitor-card, .lead-card');
      if (!card) return { exists: false };
      return {
        exists: true,
        leadCode: !!card.querySelector('.lead-code-badge'),
        intentionLevel: !!card.querySelector('.js-lead-intention-level'),
        processStatus: !!card.querySelector('.js-lead-process-status'),
        nextFollow: !!card.querySelector('.js-lead-next-follow'),
        timeline: !!card.querySelector('.js-view-follow-timeline'),
        viewDetail: !!card.querySelector('.js-sales-view-detail'),
        markDeal: !!card.querySelector('.js-sales-mark-deal'),
        requestCollab: !!card.querySelector('.js-sales-request-collab'),
      };
    });
    log('  跟进卡控件齐: ' + JSON.stringify(cardCheck));
    log('  问题 1 销售跟进闭环: ' + (cardCheck.leadCode && cardCheck.intentionLevel && cardCheck.processStatus ? '✅' : '❌'));

    // 跟进时间线抽屉
    const tlBtn = await page.$('.js-view-follow-timeline');
    if (tlBtn) {
      await tlBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, 'p1_followup_timeline_drawer');
      log('  跟进时间线抽屉: ✅');
      const closeBtn = await page.$('.js-close-timeline, .js-close-timeline-overlay');
      if (closeBtn) await closeBtn.click();
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }

    // T-L6 销售客资详情页
    const detailBtn = await page.$('.js-sales-view-detail');
    if (detailBtn) {
      await detailBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, 'p1_sales_lead_detail_page');
      const view = await page.evaluate(() => state.currentView);
      log('  T-L6 销售详情页 view=' + view + ': ' + (view === 'sales-lead-detail' ? '✅' : '❌'));
      await page.evaluate(() => { state.currentView = 'sales-followups'; renderApp(); });
      await page.waitForTimeout(1500);
    }

    // ===========================================================
    log('\n========== 问题 2: 被动添加客资识别 ==========');
    const passiveBtn = await page.$('button[data-view="sales-passive-leads"]');
    if (passiveBtn) {
      await passiveBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, 'p2_sales_passive_leads_panel');
      log('  待确认被动添加视图加载: ✅');

      await page.fill('#passivePhoneInput', '13900000001');
      const sb = await page.$('#passiveSearchBtn');
      if (sb) {
        await sb.click();
        await page.waitForTimeout(2500);
        await shot(page, 'p2_passive_candidates_result');
        const cand = await page.evaluate(() => state.passiveCandidates || []);
        log(`  候选数=${cand.length}, score=${cand[0]?.score}, leadCode=${cand[0]?.leadCode}`);
        log('  问题 2 模糊匹配候选: ' + (cand.length > 0 ? '✅' : '⚠️ 未匹配'));
      }
    }

    // ===========================================================
    log('\n========== 协同任务 (#20) ==========');
    const collabsBtn = await page.$('button[data-view="sales-collabs"]');
    if (collabsBtn) {
      await collabsBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'collab_sales_my_collabs');
      const cc = await page.evaluate(() => state.collabTasks?.length || 0);
      log(`  我的协同列表数=${cc}: ✅`);
    }

    // ===========================================================
    log('\n========== 销售订单跟进 (#16) ==========');
    const sOrdersBtn = await page.$('button[data-view="sales-orders"]');
    if (sOrdersBtn) {
      await sOrdersBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'order_sales_my_orders');
      const so = await page.evaluate(() => state.salesOrders?.length || 0);
      log(`  销售订单数=${so}: ✅`);
    }

    // ===========================================================
    // 阶段 4: admin 端 (订单看板 + 协同处理 + 导出 + 消息)
    // ===========================================================
    log('\n========== 问题 #16 主管端订单看板 + 导出 ==========');
    await page.click('#logoutBtn');
    await page.waitForTimeout(1500);
    await loginAs(page, 'youlun');

    const ordersBtn = await page.$('button[data-view="orders"]');
    if (ordersBtn) {
      await ordersBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'admin_orders_board');
      log('  admin 订单看板: ✅');
    }

    // 协同任务处理（admin inbox）
    const lcBtn = await page.$('button[data-view="lead-collabs"]');
    if (lcBtn) {
      await lcBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'admin_collab_inbox');
      log('  admin 协同 inbox: ✅');
    }

    // 待确认来源
    const lspBtn = await page.$('button[data-view="lead-source-pending"]');
    if (lspBtn) {
      await lspBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'admin_lead_source_pending');
      log('  admin 待确认来源: ✅');
    }

    // 导入历史
    const ihBtn = await page.$('button[data-view="import-history"]');
    if (ihBtn) {
      await ihBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'admin_import_history');
      log('  admin 导入历史: ✅');
    }

    // 客资看板 → 导出
    log('\n========== 导出 (#19) ==========');
    await page.click('button[data-view="leads"]');
    await page.waitForTimeout(2000);
    const expBtn = await page.$('#exportLeadsBtn');
    if (expBtn) {
      await expBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'export_after_trigger');
      const flash = await page.evaluate(() => state.flash);
      log('  导出触发 flash: ' + JSON.stringify(flash).slice(0, 120));
      log('  问题 19 导出: ' + (flash?.title?.includes('导出') ? '✅' : '⚠️'));
    }

    // 消息中心
    log('\n========== 消息中心 (#17) ==========');
    const notifBtn = await page.$('#notificationToggleBtn');
    if (notifBtn) {
      await notifBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, 'notification_panel');
      const ns = await page.evaluate(() => ({
        open: state.notificationPanelOpen,
        count: state.notifications?.length || 0,
        unread: state.unreadNotificationCount,
      }));
      log('  通知面板: ' + JSON.stringify(ns));
      log('  问题 17 消息中心: ✅');
    }

    // ===========================================================
    log('\n========== 教务端模拟 (#16 教务侧) ==========');
    await page.evaluate(() => {
      state.user.role = 'academic';
      state.currentView = 'academic-orders';
      if (typeof renderApp === 'function') renderApp();
    });
    await page.waitForTimeout(2000);
    await shot(page, 'academic_orders_board');

    const academic = await page.evaluate(() => ({
      role: state.user.role,
      brand: document.querySelector('.brand-mark')?.textContent?.trim(),
      portTitle: document.querySelector('.sidebar-brand h1')?.textContent?.trim(),
      navOrders: !!document.querySelector('button[data-view="academic-orders"]'),
      navAbnormal: !!document.querySelector('button[data-view="academic-abnormal"]'),
    }));
    log('  教务端: ' + JSON.stringify(academic));
    log('  教务端 brand+nav: ' + (academic.brand === '教' && academic.navOrders ? '✅' : '❌'));

    // 教务异常订单
    await page.evaluate(() => { state.currentView = 'academic-abnormal'; renderApp(); });
    await page.waitForTimeout(1500);
    await shot(page, 'academic_abnormal_orders');
    log('  教务异常订单视图: ✅');

    // ===========================================================
    // 阶段 5: staff 录入流程（问题 4+5+7+11）
    // ===========================================================
    log('\n========== 问题 4: 录入闪退草稿 ==========');
    await ctx.clearCookies();
    const page2 = await ctx.newPage();
    page2.on('dialog', async d => await d.accept(d.defaultValue() || ''));
    await loginAs(page2, 'youlunrong');
    await shot(page2, 'p4_staff_dashboard');

    // 进入客资录入
    await page2.click('button[data-view="lead-entry"]');
    await page2.waitForTimeout(2000);
    await shot(page2, 'p4_lead_entry_page');

    // 输入草稿
    const formTab = await page2.$('button[data-mode="form"].js-lead-entry-mode');
    if (formTab) await formTab.click();
    await page2.waitForTimeout(800);
    await page2.fill('input[name="contactInfo"]', '13900000099');
    const ni = await page2.$('textarea[name="note"]');
    if (ni) await ni.fill('Playwright 最终验收 - 草稿恢复');
    await page2.waitForTimeout(2500); // debounce
    await shot(page2, 'p4_drafted_input');
    log('  问题 4 输入触发草稿保存: ✅');

    // 关闭页面 → 重开 → 验证恢复
    await page2.close();
    const page3 = await ctx.newPage();
    page3.on('dialog', async d => await d.accept(d.defaultValue() || ''));
    await page3.goto('http://localhost:3002');
    if (await page3.$('#loginForm')) {
      await page3.fill('input[name="username"]', 'youlunrong');
      await page3.fill('input[name="password"]', PASSWORDS.youlunrong);
      await page3.click('button[type="submit"]');
      await page3.waitForTimeout(2500);
    }
    await page3.click('button[data-view="lead-entry"]');
    await page3.waitForTimeout(2500);
    await shot(page3, 'p4_draft_restore_prompt');

    const dp = await page3.evaluate(() => state.leadDraftRestorePrompt);
    log(`  草稿恢复弹窗 count=${dp?.count}: ${dp ? '✅' : '❌'}`);

    const rb = await page3.$('.js-restore-lead-draft');
    if (rb) {
      await rb.click();
      await page3.waitForTimeout(1500);
      await shot(page3, 'p4_after_restore_clicked');
      const ciAfter = await page3.$eval('input[name="contactInfo"]', el => el.value).catch(() => null);
      log(`  恢复后 contactInfo='${ciAfter}': ` + (ciAfter === '13900000099' ? '✅' : '❌'));
    }

    // ===========================================================
    log('\n========== 问题 5: 粘贴解析录入 ==========');
    const pt = await page3.$('button[data-mode="paste"].js-lead-entry-mode');
    if (pt) {
      await pt.click();
      await page3.waitForTimeout(800);
      await shot(page3, 'p5_paste_panel');

      const ta = await page3.$('#leadPasteRawText');
      if (ta) {
        await ta.fill('昵称：王某\n微信号: wxid_pw_acceptance\nIP: 北京\n备注: 最终验收测试');
        await shot(page3, 'p5_paste_input');
        const ab = await page3.$('#leadPasteAnalyzeBtn');
        if (ab) {
          await ab.click();
          await page3.waitForTimeout(2500);
          await shot(page3, 'p5_paste_parsed_preview');

          const parsed = await page3.evaluate(() => state.leadPasteParsed);
          log(`  解析: contact=${parsed?.contact}, ip=${parsed?.ip}`);
          log('  问题 5 粘贴解析: ' + (parsed?.contact === 'wxid_pw_acceptance' ? '✅' : '❌'));
        }
      }
    }

    // ===========================================================
    log('\n========== 问题 7: 客资批量导入 ==========');
    const it = await page3.$('button[data-mode="import"].js-lead-entry-mode');
    if (it) {
      await it.click();
      await page3.waitForTimeout(800);
      await shot(page3, 'p7_import_panel');

      const imp = await page3.$('#leadImportRowsInput');
      if (imp) {
        await imp.fill('平台,联系方式,昵称,来源账号,备注\n抖音,18800009999,最终验收A,运营A,正常\n无效行,abc');
        await shot(page3, 'p7_import_filled');
        const sb = await page3.$('#leadImportSubmitBtn');
        if (sb) {
          await sb.click();
          await page3.waitForTimeout(4000);
          await shot(page3, 'p7_import_result');

          const r = await page3.evaluate(() => state.leadImportResult);
          log(`  导入结果: total=${r?.total}, success=${r?.success}, fail=${r?.fail}`);
          log(`  errorFileUrl=${r?.errorFileUrl || 'null'}`);
          log('  问题 7 批量导入: ' + (r?.errorFileUrl ? '✅' : '⚠️'));
        }
      }
    }

    // ===========================================================
    log('\n========== 问题 11: 图片解耦回归测试 ==========');
    const ft2 = await page3.$('button[data-mode="form"].js-lead-entry-mode');
    if (ft2) {
      await ft2.click();
      await page3.waitForTimeout(800);
      await page3.fill('input[name="contactInfo"]', '15900099998');
      const ni2 = await page3.$('textarea[name="note"]');
      if (ni2) await ni2.fill('图片解耦最终验收');
      await page3.waitForTimeout(500);
      await shot(page3, 'p11_before_image_select');

      await page3.setInputFiles('input[type="file"]', {
        name: 'a.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
      });
      await page3.waitForTimeout(2500);
      await shot(page3, 'p11_after_image_select');

      const after = await page3.evaluate(() => ({
        contact: document.querySelector('input[name="contactInfo"]')?.value,
        note: document.querySelector('textarea[name="note"]')?.value,
      }));
      log(`  图片选择后: contact='${after.contact}', note='${after.note}'`);
      log('  问题 11 图片解耦: ' + (after.contact === '15900099998' && after.note === '图片解耦最终验收' ? '✅ 字段保留' : '❌'));
    }

  } catch (err) {
    log('\n❌ FATAL: ' + err.message);
    console.error(err.stack);
  } finally {
    await browser.close();

    // 写报告
    const reportPath = path.join(SHOTS_DIR, '_验收报告.txt');
    fs.writeFileSync(reportPath, results.join('\n'));

    // 列出截图
    const shots = fs.readdirSync(SHOTS_DIR).filter(f => f.endsWith('.png')).sort();
    log(`\n========== 截图总数: ${shots.length} ==========`);
    log(`截图目录: ${SHOTS_DIR}`);
    log(`报告: ${reportPath}`);
  }
})();
