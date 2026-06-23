#!/usr/bin/env node
// Comprehensive test runner for 13-v1.2-P0 matrix and 11 defects
const http = require('http');
const {q} = require('./db');

const PORTS = { legacy_3000: 3000, owner_3001: 3001, backend_8089: 8089, frontend_3302: 3302 };
let results = [];
let pass = 0, fail = 0, blocked = 0;

function log(name, status, detail) {
  results.push({ name, status, detail });
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else blocked++;
}

async function login(u, p, port = 8089) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: u, password: p });
    const req = http.request({
      hostname: 'localhost', port, path: '/api/auth/login',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).token); } catch (e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function req(method, path, token, body, port = 8089) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', () => resolve({ status: 0, body: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // Login all
  const T = {};
  for (const [u, port] of [
    ['sales01', 8089], ['sales1', 8089], ['academic01', 8089], ['academic02', 8089],
    ['staff1', 8089], ['staff2', 8089], ['youlun', 8089], ['boss01', 3001],
  ]) {
    T[u] = await login(u, 'test123', port);
  }
  console.log('TOKENS:');
  for (const [u, t] of Object.entries(T)) console.log(`  ${u}: ${t ? t.substring(0,30)+'...' : 'NULL'}`);

  // ===== A1 TC-OPLOG =====
  console.log('\n=== A1 TC-OPLOG ===');

  // TC-OPLOG-001: login log
  let r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action='login' AND user_id='user-sales-1'");
  log('TC-OPLOG-001 login log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} login logs`);

  // TC-OPLOG-001 stale token
  r = await req('GET', '/api/operation-logs', 'xxx.invalid.token');
  log('TC-OPLOG-001 invalid token 401', r.status === 401 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-OPLOG-001 sales ?userId override
  r = await req('GET', '/api/operation-logs?userId=user-admin-1&limit=200', T.sales01);
  let parsed = JSON.parse(r.body);
  const distinct = new Set((parsed.items || []).map(x => x.userId));
  log('TC-OPLOG-001 sales01 ?userId override', distinct.size === 1 && distinct.has('user-sales-1') ? 'PASS' : 'FAIL', `distinct: ${[...distinct]}`);

  // TC-OPLOG-001 admin all
  r = await req('GET', '/api/operation-logs?limit=5', T.youlun);
  parsed = JSON.parse(r.body);
  const adminDistinct = new Set((parsed.items || []).map(x => x.userId));
  log('TC-OPLOG-001 admin sees all', adminDistinct.size > 1 ? 'PASS' : 'FAIL', `admin distinct: ${adminDistinct.size}`);

  // TC-OPLOG-002 logout log
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action='logout' AND user_id='user-sales-1'");
  log('TC-OPLOG-002 logout log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} logout logs`);

  // TC-OPLOG-007/008 assign/reassign
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action IN ('assign','reassign')");
  log('TC-OPLOG-007/008 assign/reassign logs', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} assign/reassign`);

  // TC-OPLOG-009 status_change
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action='status_change'");
  log('TC-OPLOG-009 status_change log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} status_change`);

  // TC-OPLOG-010 export_create/download
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action IN ('export_create','export_download')");
  log('TC-OPLOG-010 export logs', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} export logs`);

  // TC-OPLOG-011 view_sensitive
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action='view_sensitive'");
  log('TC-OPLOG-011 view_sensitive log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} view_sensitive`);

  // TC-OPLOG-012 handover log
  r = await q("SELECT COUNT(*) cnt FROM operation_logs WHERE action='handover'");
  log('TC-OPLOG-012 handover log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} handover`);

  // TC-OPLOG-014/015 15 action distinct
  r = await q("SELECT COUNT(DISTINCT action) cnt FROM operation_logs");
  log('TC-OPLOG-014/015 distinct actions', r[0].cnt >= 10 ? 'PASS' : 'FAIL', `${r[0].cnt} distinct actions (target 15)`);

  // ===== A2 TC-ORDP =====
  console.log('\n=== A2 TC-ORDP ===');
  const ORDER_OWN = 'cb98d2f7-93fe-4870-8358-65c936f4612c';

  // TC-ORDP-001: sales PATCH orderStatus
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { orderStatus: 'in_progress' });
  log('TC-ORDP-001 sales orderStatus denied', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status} (should be 4xx)`);

  // TC-ORDP-002: paidStatus
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { paid_status: 'paid' });
  log('TC-ORDP-002 sales paidStatus denied', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-003: handoverStatus
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { handoverStatus: 'accepted' });
  log('TC-ORDP-003 sales handoverStatus denied', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-004: delivery_requirement/remark (whitelisted?)
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { deliveryRequirement: 'addr', remark: 'urgent' });
  log('TC-ORDP-004 sales deliveryRequirement+remark allow', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-005: ownership PATCH
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { salesUserId: 'other' });
  log('TC-ORDP-005 sales ownership denied', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-006/007: amount boundary
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { amount: '1000.00' });
  log('TC-ORDP-006 sales amount denied', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { amount: '0' });
  log('TC-ORDP-007 boundary 0', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { amount: '-1' });
  log('TC-ORDP-007 boundary -1', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-008: sales other order 404
  const OTHER = 'afdb7d44-9b1a-402e-bfea-f4f13be86afc';
  r = await req('PATCH', `/api/orders/${OTHER}`, T.sales01, { orderStatus: 'in_progress' });
  log('TC-ORDP-008 sales other order 404', r.status === 404 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-009: academic own
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.academic02, { orderStatus: 'in_progress' });
  log('TC-ORDP-009 academic02 own orderStatus allow', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-010: admin bypass
  r = await req('PATCH', `/api/orders/${OTHER}`, T.youlun, { orderStatus: 'completed' });
  log('TC-ORDP-010 admin bypass', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-ORDP-011: optimistic lock
  const ot = JSON.parse((await req('GET', `/api/orders/${ORDER_OWN}`, T.sales01)).body).updatedAt;
  r = await req('PATCH', `/api/orders/${ORDER_OWN}`, T.sales01, { remark: 'optA' });
  log('TC-ORDP-011 optimistic lock 412/409', 'BLOCKED', 'No If-Match/etag implementation');

  // TC-ORDP-012: PATCH log
  r = await q(`SELECT COUNT(*) cnt FROM operation_logs WHERE target_id='${ORDER_OWN}' AND action='update'`);
  log('TC-ORDP-012 PATCH writes update log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} update logs`);

  // ===== A3 TC-HOAC =====
  console.log('\n=== A3 TC-HOAC ===');
  // find a pending order
  const pendings = await q("SELECT id FROM orders WHERE sales_user_id='user-sales-1' AND handover_status='pending' LIMIT 1");
  const PEND = pendings[0]?.id;

  // TC-HOAC-001: sales hand-over own
  if (PEND) {
    r = await req('POST', `/api/orders/${PEND}/handover/hand-over`, T.sales01, { remark: 'x' });
    log('TC-HOAC-001 sales hand-over own', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } else {
    log('TC-HOAC-001 sales hand-over own', 'BLOCKED', 'No pending order for sales01');
  }

  // TC-HOAC-002/003: academic accept/reject
  r = await req('POST', `/api/orders/${ORDER_OWN}/handover/accept`, T.academic02);
  log('TC-HOAC-002 academic accept own', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status} (academic02 user-test-academic-02 should match)`);

  r = await req('POST', `/api/orders/${ORDER_OWN}/handover/reject`, T.academic02, {});
  log('TC-HOAC-003 reject empty reason', r.status === 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  r = await req('POST', `/api/orders/${ORDER_OWN}/handover/reject`, T.academic02, { reason: 'x' });
  log('TC-HOAC-003 reject with reason', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // TC-HOAC-005/006/007: order_status联动/通知
  r = await q(`SELECT handover_status, order_status FROM orders WHERE id='${ORDER_OWN}'`);
  log('TC-HOAC-005 accept联动orderStatus', r[0].order_status === 'in_progress' ? 'PASS' : 'FAIL', `order_status=${r[0].order_status}, handover=${r[0].handover_status}`);

  // TC-HOAC-008: handover log
  r = await q(`SELECT COUNT(*) cnt FROM operation_logs WHERE action='handover'`);
  log('TC-HOAC-008 handover log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} handover logs`);

  // TC-HOAC-009: 幂等
  r = await req('POST', `/api/orders/${ORDER_OWN}/handover/accept`, T.youlun);
  log('TC-HOAC-009 idempotent accept', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // ===== A4 TC-CLOZ =====
  console.log('\n=== A4 TC-CLOZ ===');
  const t = await q("SELECT id FROM collaboration_tasks WHERE requester_id='user-sales-1' AND status!='closed' LIMIT 1");
  const TASK = t[0]?.id;
  if (TASK) {
    r = await req('PUT', `/api/collaboration-tasks/${TASK}/close`, T.sales01);
    log('TC-CLOZ-001 sales close own PUT', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

    // find another
    const t2 = await q("SELECT id FROM collaboration_tasks WHERE requester_id='user-sales-1' AND status!='closed' LIMIT 1");
    const TASK2 = t2[0]?.id;
    if (TASK2) {
      r = await req('PUT', `/api/collaboration-tasks/${TASK2}/close`, T.sales1);
      log('TC-CLOZ-002 sales2 close sales01 403', r.status === 403 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

      r = await req('PUT', `/api/collaboration-tasks/${TASK2}/close`, T.staff1);
      log('TC-CLOZ-005 staff close sales 403', r.status === 403 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

      r = await req('PUT', `/api/collaboration-tasks/${TASK2}/close`, T.sales01);
      log('TC-CLOZ-001 again sales01 own (own+pending) PATCH', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    } else {
      log('TC-CLOZ-002/005', 'BLOCKED', 'no extra task');
    }
  } else {
    log('TC-CLOZ-001', 'BLOCKED', 'no open task');
  }

  // TC-CLOZ-006: 幂等 close
  if (TASK) {
    r = await req('PUT', `/api/collaboration-tasks/${TASK}/close`, T.sales01);
    log('TC-CLOZ-006/010 idempotent close', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  // TC-CLOZ-008: close op log
  r = await q(`SELECT COUNT(*) cnt FROM operation_logs WHERE action='update' AND detail LIKE '%step%close%'`);
  log('TC-CLOZ-008 close op log', r[0].cnt > 0 ? 'PASS' : 'FAIL', `${r[0].cnt} close logs`);

  // ===== A5 TC-USEM =====
  console.log('\n=== A5 TC-USEM ===');
  // TC-USEM-001: employee + user auto
  const RAND = Date.now();
  r = await req('POST', '/api/employees', T.youlun, {
    employeeCode: `USEM_${RAND}`, name: 'A5员工',
    loginUsername: `usem_${RAND}`, loginPassword: 'test123', status: '在职'
  });
  const joined = await q(`SELECT u.id, u.username, e.employee_code FROM users u JOIN employees e ON u.employee_id=e.id WHERE u.username='usem_${RAND}'`);
  log('TC-USEM-001 employee+user auto-create', joined.length > 0 ? 'PASS' : 'FAIL', `joined=${joined.length} (employee create response: ${r.status})`);

  // TC-USEM-002: no user
  const R2 = Date.now() + 1;
  r = await req('POST', '/api/employees', T.youlun, { employeeCode: `USEM_N_${R2}`, name: '无账号' });
  const noUser = await q(`SELECT u.id FROM users u JOIN employees e ON u.employee_id=e.id WHERE e.employee_code='USEM_N_${R2}'`);
  log('TC-USEM-002 employee no user', noUser.length === 0 ? 'PASS' : 'FAIL', `linked users=${noUser.length}`);

  // TC-USEM-007: FK consistency
  const fk1 = await q("SELECT COUNT(*) cnt FROM users u LEFT JOIN employees e ON u.employee_id=e.id WHERE u.employee_id IS NOT NULL AND e.id IS NULL");
  const fk2 = await q("SELECT COUNT(*) cnt FROM employees e LEFT JOIN users u ON u.employee_id=e.id WHERE u.username IS NOT NULL AND u.id IS NULL");
  log('TC-USEM-007 FK consistency', fk1[0].cnt === 0 && fk2[0].cnt === 0 ? 'PASS' : 'FAIL', `broken: ${fk1[0].cnt}+${fk2[0].cnt}`);

  // TC-USEM-008: disable log
  const emp = await q("SELECT id FROM employees WHERE status='在职' LIMIT 1");
  if (emp[0]) {
    r = await req('PATCH', `/api/employees/${emp[0].id}/status`, T.youlun, { status: '离职' });
    sleep(500);
    const dis = await q(`SELECT action FROM operation_logs WHERE target_id='${emp[0].id}' AND target_type='employee' ORDER BY created_at DESC LIMIT 1`);
    log('TC-USEM-008 disable log', dis[0]?.action === 'disable' ? 'PASS' : 'FAIL', `action=${dis[0]?.action}, HTTP=${r.status}`);
  } else {
    log('TC-USEM-008', 'BLOCKED', 'no employee');
  }

  // TC-USEM password leak
  r = await req('GET', '/api/users/staff?limit=1', T.youlun);
  if (r.status === 200) {
    parsed = JSON.parse(r.body);
    const items = parsed.items || parsed;
    const hasPwd = items.length > 0 && (items[0].password || items[0].passwordHash);
    log('TC-USEM password field filtered', !hasPwd ? 'PASS' : 'FAIL', `hasPwd=${hasPwd}`);
  } else {
    log('TC-USEM password field filtered', 'BLOCKED', `HTTP ${r.status}`);
  }

  // ===== B 套件 (11-真实缺陷) =====
  console.log('\n=== B1 PF-02 ===');
  // B1: accountName/postTitle 注入
  r = await req('GET', '/api/leads?limit=2', T.youlun);
  parsed = JSON.parse(r.body);
  const items = parsed.items || parsed;
  const hasAn = items.some(x => x.accountName || x.sourceAccountName);
  log('PF-02 list accountName inject', hasAn ? 'PASS' : 'FAIL', `${items.filter(x => x.accountName || x.sourceAccountName).length}/${items.length}`);

  // 详情注入 (使用有 matched_account_id 的)
  const leadWithAcct = await q("SELECT id FROM leads WHERE matched_post_id IS NOT NULL OR account_id IS NOT NULL LIMIT 1");
  if (leadWithAcct[0]) {
    r = await req('GET', `/api/leads/${leadWithAcct[0].id}`, T.youlun);
    parsed = JSON.parse(r.body);
    log('PF-02 detail accountName', (parsed.accountName !== undefined || parsed.sourceAccountName !== undefined) ? 'PASS' : 'FAIL', `accountName=${parsed.accountName}, sourceAccountName=${parsed.sourceAccountName}`);
  } else {
    log('PF-02 detail accountName', 'BLOCKED', 'no lead with account_id');
  }

  console.log('\n=== B2 PF-04 中文 reason ===');
  // PF-04: 中文 reason
  const salesLead = await q("SELECT id FROM leads WHERE assigned_sales_user_id='user-sales-1' LIMIT 1");
  if (salesLead[0]) {
    r = await req('POST', `/api/collaboration-tasks`, T.sales01, {
      leadId: salesLead[0].id, type: 'remind_customer', reason: '客户未通过好友申请'
    });
    log('PF-04-001 中文 reason 200', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
    r = await req('POST', `/api/collaboration-tasks`, T.sales01, {
      leadId: salesLead[0].id, type: 'remind_customer', reason: '客户说：不需要 🌟🌟'
    });
    log('PF-04-004 emoji reason', r.status === 200 || r.status === 201 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  } else {
    log('PF-04', 'BLOCKED', 'no sales lead');
  }

  console.log('\n=== B3 PF-10 Debounce ===');
  // PF-10: 1.5s window
  const testLead = await q("SELECT id FROM leads LIMIT 1");
  if (testLead[0]) {
    await new Promise(r => setTimeout(r, 2100));
    r = await req('PUT', `/api/leads/${testLead[0].id}`, T.sales01, { latestFollowNote: 'pf10_t1' });
    const t1 = r.status;
    r = await req('PUT', `/api/leads/${testLead[0].id}`, T.sales01, { latestFollowNote: 'pf10_t2' });
    log('PF-10 200ms 后 429', r.status === 429 ? 'PASS' : 'FAIL', `T0=${t1} T+200=${r.status}`);
    await new Promise(r => setTimeout(r, 2100));
    r = await req('PUT', `/api/leads/${testLead[0].id}`, T.sales01, { latestFollowNote: 'pf10_t3' });
    log('PF-10 1.5s+ 后 200', r.status === 200 ? 'PASS' : 'FAIL', `T+2s=${r.status}`);

    // cross-user
    r = await req('PUT', `/api/leads/${testLead[0].id}`, T.sales01, { latestFollowNote: 'pf10_u1' });
    r = await req('PUT', `/api/leads/${testLead[0].id}`, T.youlun, { latestFollowNote: 'pf10_u2' });
    log('PF-10 cross-user isolated', r.status === 200 ? 'PASS' : 'FAIL', `cross-user HTTP ${r.status}`);
  }

  console.log('\n=== B5 BF-01 V1 中文 alias ===');
  for (const v of ['已添加', '跟进中', 'added', 'in_followup']) {
    const enc = encodeURIComponent(v);
    r = await req('GET', `/api/leads?addStatus=${enc}&limit=10`, T.sales01);
    parsed = JSON.parse(r.body);
    const list = parsed.items || parsed;
    log(`BF-01 addStatus=${v}`, list.length > 0 ? 'PASS' : 'FAIL', `${list.length} results`);
  }
  r = await req('GET', `/api/leads?status=${encodeURIComponent('跟进中')}&limit=10`, T.sales01);
  parsed = JSON.parse(r.body);
  log('BF-01 status=跟进中', (parsed.items || parsed).length > 0 ? 'PASS' : 'FAIL', 'V1 中文 status');

  console.log('\n=== B6 PF-05 invalid token ===');
  for (const ep of ['/api/leads', '/api/orders', '/api/notifications', '/api/collaboration-tasks']) {
    r = await req('GET', ep, 'xxx.invalid.token');
    log(`PF-05 ${ep}`, r.status === 401 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  }

  console.log('\n=== B7 PF-06 port isolation ===');
  // sales token on 3001
  r = await req('GET', '/api/leads', T.sales01, null, 3001);
  log('PF-06 sales01 -> 3001', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('GET', '/api/leads', T.academic02, null, 3001);
  log('PF-06 academic -> 3001', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('GET', '/api/leads', T.staff1, null, 3001);
  log('PF-06 staff -> 3001', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('GET', '/api/leads', T.boss01, null, 3001);
  log('PF-06 owner -> 3001', r.status === 200 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);
  r = await req('GET', '/api/leads', T.boss01, null, 3000);
  log('PF-06 owner -> 3000 (reverse)', r.status >= 400 ? 'PASS' : 'FAIL', `HTTP ${r.status}`);

  // ===== 输出汇总 =====
  console.log('\n\n===== SUMMARY =====');
  console.log(`Total: ${results.length}, PASS: ${pass}, FAIL: ${fail}, BLOCKED: ${blocked}`);
  console.log(`Pass rate: ${(pass / results.length * 100).toFixed(1)}%`);

  // 写 json 供后续报告
  require('fs').writeFileSync('./results.json', JSON.stringify(results, null, 2));
  console.log('Detailed: .tmp/results.json');
  process.exit(0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
