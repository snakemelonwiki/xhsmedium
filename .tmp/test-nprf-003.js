const { io } = require('../test-suite-15-16/node_modules/socket.io-client');
const http = require('http');

function httpReq(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 8089, path, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 1. 拿 staff1 token
  const staffLogin = await httpReq('POST', '/api/auth/login', null, { username: 'staff1', password: 'test123' });
  const STAFF = JSON.parse(staffLogin.body).token;
  console.log('STAFF token:', STAFF.substring(0, 50) + '...');

  // 2. 拿 sales01 token
  const salesLogin = await httpReq('POST', '/api/auth/login', null, { username: 'sales01', password: 'test123' });
  const SALES = JSON.parse(salesLogin.body).token;
  console.log('SALES token:', SALES.substring(0, 50) + '...');

  // 3. staff1 连 socket
  const socket = io('http://127.0.0.1:8089/notifications', {
    auth: { token: STAFF },
    transports: ['websocket', 'polling'],
  });
  let capturedEvents = [];
  socket.on('connect', () => console.log('socket connected, sid=', socket.id));
  socket.onAny((event, payload) => {
    capturedEvents.push({ event, payload, receivedAt: Date.now() });
    const hasT = payload && 't' in payload;
    console.log(`[event=${event}] payload.t=${payload?.t} hasT=${hasT} keys=${payload ? Object.keys(payload).join(',') : 'null'}`);
  });
  socket.on('connect_error', err => console.log('connect_error:', err.message));

  await new Promise(r => setTimeout(r, 1500));

  // 4. 触发 1 条 lead_assigned：sales01 创建 lead 并分配给 staff1 不会触发；
  // staff1 自己创建 lead 分配给 sales01，staff1 不会收到 lead_assigned 通知（被分配的销售才收）
  // 改：staff1 创建 lead 分配给 sales01，staff1 用 sales01 的 socket 监听
  // 简化路径：staff1 触发 source-confirm 路径（命中 leads.service.ts:881-892 通知 sales）
  // 先查一条 sales01 名下 source_confirmed=0 的 lead
  const m = require('mysql2/promise');
  const c = await m.createConnection({ host: '127.0.0.1', user: 'root', password: 'caigua123...', database: 'lan_dual_role_system' });
  const [leads] = await c.query("SELECT id, lead_code FROM leads WHERE assigned_sales_user_id='user-sales-1' AND status NOT IN ('closed','invalid') ORDER BY created_at DESC LIMIT 1");
  console.log('=== sales01 名下 lead ===', leads);
  if (leads.length) {
    const r = await httpReq('POST', '/api/leads/' + leads[0].id + '/source-confirm', STAFF, { matchedPostId: 'post-02173f96-d7f5-4340-84f4-27da3be5c997', sourceOperatorId: 'user-test-staff-01' });
    console.log('=== PUT confirm-source ===', r.status, r.body.substring(0, 300));
  }
  // 等 2s
  await new Promise(r => setTimeout(r, 2000));
  console.log('=== 捕获事件数:', capturedEvents.length);
  capturedEvents.forEach((e, i) => {
    console.log(`#${i} event=${e.event} hasT=${e.payload && 't' in e.payload} t=${e.payload?.t} keys=${e.payload ? Object.keys(e.payload).join(',') : 'null'}`);
  });
  // 看 API 返回的通知结构
  const n = await httpReq('GET', '/api/notifications?limit=2', STAFF);
  const items = JSON.parse(n.body).items || [];
  console.log('=== API 返回的通知字段 ===');
  items.forEach(it => console.log({ id: it.id, type_code: it.type_code, fields: Object.keys(it), hasT: 't' in it }));
  socket.disconnect();
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
