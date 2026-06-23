// PF-05 回归测试脚本
const http = require('http');

const PORT = 8089;
let cookieJar = '';
let sales2Token = '';

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Server-Port': '3000',  // 模拟主入口
        ...(cookieJar ? { Cookie: cookieJar } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) cookieJar = setCookie.map((c) => c.split(';')[0]).join('; ');
        let json = null;
        try { json = JSON.parse(buf); } catch { json = buf; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // 1. sales2 登录
  console.log('=== 1) sales2 login ===');
  let r = await req('POST', '/api/auth/login', { username: 'sales2', password: 'test123' });
  console.log('status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 200));
  if (r.status !== 201 && r.status !== 200) {
    console.log('login failed, abort');
    process.exit(1);
  }
  const loginBody = r.body?.result || r.body;
  sales2Token = loginBody?.token || loginBody?.data?.token;
  if (!sales2Token) {
    // 兼容旧版 response 包一层
    sales2Token = r.body?.token;
  }
  console.log('TOKEN length:', sales2Token?.length);

  // 2. 用 token 调 leads (pageSize=1) - 应 200
  console.log('\n=== 2) GET /api/leads (before logout) ===');
  r = await req('GET', '/api/leads?pageSize=1', null, { Authorization: `Bearer ${sales2Token}` });
  console.log('status:', r.status, 'body keys:', r.body ? Object.keys(r.body) : null);
  const beforePass = (r.status === 200 || r.status === 201);

  // 3. logout - 应 201
  console.log('\n=== 3) POST /api/auth/logout ===');
  r = await req('POST', '/api/auth/logout', null, { Authorization: `Bearer ${sales2Token}` });
  console.log('status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 200));
  const logoutOk = (r.status === 200 || r.status === 201);

  // 4. 用同一 token 调 leads - 应 401 (关键 P0 修复验证)
  console.log('\n=== 4) GET /api/leads (after logout, same token) ===');
  r = await req('GET', '/api/leads?pageSize=1', null, { Authorization: `Bearer ${sales2Token}` });
  console.log('status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 300));
  const afterReject = (r.status === 401);

  // 5. 用同一 token 调任意 API (users) - 应 401
  console.log('\n=== 5) GET /api/users (after logout, same token) ===');
  r = await req('GET', '/api/users?limit=1', null, { Authorization: `Bearer ${sales2Token}` });
  console.log('status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 300));
  const usersReject = (r.status === 401);

  // 6. 重新登录拿新 token 验证正常
  console.log('\n=== 6) sales2 re-login (new token) ===');
  r = await req('POST', '/api/auth/login', { username: 'sales2', password: 'test123' });
  console.log('status:', r.status);
  const reloginBody = r.body?.result || r.body;
  const newToken = reloginBody?.token || r.body?.token;
  r = await req('GET', '/api/leads?pageSize=1', null, { Authorization: `Bearer ${newToken}` });
  console.log('new-token leads status:', r.status);
  const newTokenPass = (r.status === 200 || r.status === 201);

  // 7. 旧 token 仍应 401 (双保险)
  console.log('\n=== 7) Old token again ===');
  r = await req('GET', '/api/leads?pageSize=1', null, { Authorization: `Bearer ${sales2Token}` });
  console.log('status:', r.status);
  const oldTokenStillReject = (r.status === 401);

  console.log('\n========= RESULTS =========');
  console.log('TC-PF05-X1 leads before logout (200):', beforePass ? 'PASS' : 'FAIL');
  console.log('TC-PF05 logout (201):', logoutOk ? 'PASS' : 'FAIL');
  console.log('TC-PF05-X1 leads after logout (401):', afterReject ? 'PASS' : 'FAIL');
  console.log('TC-PF05-X2 users after logout (401):', usersReject ? 'PASS' : 'FAIL');
  console.log('TC-PF05-X3 new token works (200):', newTokenPass ? 'PASS' : 'FAIL');
  console.log('TC-PF05-X3 old token still rejected (401):', oldTokenStillReject ? 'PASS' : 'FAIL');
  const allPass = beforePass && logoutOk && afterReject && usersReject && newTokenPass && oldTokenStillReject;
  console.log('OVERALL:', allPass ? '✅ ALL PASS' : '❌ FAIL');
  process.exit(allPass ? 0 : 1);
})();
