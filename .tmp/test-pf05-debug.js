const http = require('http');
function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 8089, path, method,
      headers: { 'Content-Type': 'application/json', 'X-Server-Port': '3000', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    };
    const r = http.request(opts, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch { j = buf; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  console.log('1) login');
  let r = await req('POST', '/api/auth/login', { username: 'sales2', password: 'test123' });
  console.log('login status:', r.status);
  console.log('login body:', JSON.stringify(r.body).substring(0, 500));
  // 兼容多种 response 包装
  const token = r.body?.token || r.body?.result?.token || r.body?.data?.token;
  console.log('token length:', token?.length);
  console.log('2) me with new token');
  r = await req('GET', '/api/auth/me', null, { Authorization: 'Bearer ' + token });
  console.log('me status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 300));
  console.log('3) leads');
  r = await req('GET', '/api/leads?pageSize=1', null, { Authorization: 'Bearer ' + token });
  console.log('leads status:', r.status, 'body:', JSON.stringify(r.body).substring(0, 200));
})();
