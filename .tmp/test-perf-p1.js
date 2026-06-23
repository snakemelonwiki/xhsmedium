// 16-性能 P1 复测：VU=50/100 列表分页、offset=10000 深度分页、10000+ 导出、1000+ 导入
const http = require('http');

function httpReq(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const start = Date.now();
    const req = http.request({ hostname: '127.0.0.1', port: 8089, path, method, headers, timeout: 60000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - start, body: d }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function pct(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.min(Math.floor((sorted.length - 1) * p / 100), sorted.length - 1)];
}

async function runLoad(label, n, makeRequest) {
  const results = [];
  const errors = [];
  // 启动 n 个并发
  const promises = Array.from({ length: n }, () => makeRequest().then(r => results.push(r.ms)).catch(e => errors.push(e.message)));
  await Promise.all(promises);
  const p50 = pct(results, 50), p95 = pct(results, 95), p99 = pct(results, 99);
  const max = Math.max(...results), min = Math.min(...results);
  console.log(`${label}: n=${n} success=${results.length} errors=${errors.length} p50=${p50}ms p95=${p95}ms p99=${p99}ms min=${min}ms max=${max}ms`);
  if (errors.length) console.log('  first errors:', errors.slice(0, 3));
  return { p50, p95, p99, max, min, success: results.length, errors: errors.length };
}

(async () => {
  const staffLogin = await httpReq('POST', '/api/auth/login', null, { username: 'staff1', password: 'test123' });
  const STAFF = JSON.parse(staffLogin.body).token;
  const salesLogin = await httpReq('POST', '/api/auth/login', null, { username: 'sales01', password: 'test123' });
  const SALES_TOK = JSON.parse(salesLogin.body).token;
  console.log('=== 16-性能 P1 复测 (token 长度:', STAFF.length, ') ===\n');

  // TC-PAG-001 VU=50 leads 列表
  await runLoad('TC-PAG-001 VU=50 leads 列表 limit=20', 50, () => httpReq('GET', '/api/leads?limit=20&offset=0', STAFF));

  // TC-PAG-002 VU=100 leads 列表
  await runLoad('TC-PAG-002 VU=100 leads 列表 limit=20', 100, () => httpReq('GET', '/api/leads?limit=20&offset=0', STAFF));

  // TC-PAG-003 VU=50 accounts 列表
  await runLoad('TC-PAG-003 VU=50 accounts 列表 limit=20', 50, () => httpReq('GET', '/api/accounts?limit=20&offset=0', STAFF));

  // TC-PAG-004 offset=10000 leads 深度分页
  console.log('\n--- 深度分页 offset=10000 ---');
  const deep = await httpReq('GET', '/api/leads?limit=20&offset=10000', STAFF);
  console.log('offset=10000:', deep.status, deep.ms + 'ms', deep.body.substring(0, 200));
  const deep5 = await httpReq('GET', '/api/leads?limit=20&offset=5000', STAFF);
  console.log('offset=5000:', deep5.status, deep5.ms + 'ms', deep5.body.substring(0, 200));
  const deep8 = await httpReq('GET', '/api/leads?limit=20&offset=8000', STAFF);
  console.log('offset=8000:', deep8.status, deep8.ms + 'ms', deep8.body.substring(0, 200));

  // 复测 VU=20 offset=10000
  await runLoad('VU=20 offset=10000 深度分页', 20, () => httpReq('GET', '/api/leads?limit=20&offset=10000', STAFF));

  // TC-BIGE-001 10000+ 导出 (异步任务)
  console.log('\n--- 10000+ 导出 (异步) ---');
  const exportReq = await httpReq('POST', '/api/exports', SALES_TOK, { exportType: 'leads', filter: { limit: 20000 } });
  console.log('POST /api/exports:', exportReq.status, exportReq.ms + 'ms', exportReq.body.substring(0, 400));
  let taskId;
  try { taskId = JSON.parse(exportReq.body).taskId || JSON.parse(exportReq.body).id; } catch {}
  if (taskId) {
    // 轮询 status
    const start = Date.now();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await httpReq('GET', '/api/exports/' + taskId, STAFF);
      const obj = JSON.parse(s.body);
      console.log(`  poll ${i}: status=${obj.status} elapsed=${Date.now() - start}ms`);
      if (obj.status === 'completed' || obj.status === 'failed') {
        console.log('  最终结果:', obj.status, obj);
        break;
      }
    }
  } else {
    console.log('未拿到 taskId');
  }

  // TC-BIGI-001 1000+ 导入 (异步)
  console.log('\n--- 1000+ 导入 (粘贴 rows 异步) ---');
  // 构造 1000 行 TSV (12 列)
  const cols = ['contact_info', 'nickname', 'platform', 'budget', 'major_content', 'ip', 'note', 'requirement_note', 'sales_feedback', 'source_unknown', 'intention_level', 'process_status'];
  const rowsArr = Array.from({ length: 1000 }, (_, i) =>
    ['139' + String(10000000 + i).padStart(8, '0'), '压测' + i, 'xhs', '1000', '内容' + i, '深圳', 'note' + i, 'req' + i, 'fb' + i, '0', 'mid', 'pending'].join('\t')
  );
  const importReq = await httpReq('POST', '/api/leads/import-paste', STAFF, { rows: rowsArr });
  console.log('POST /api/leads/import-paste 1000 行:', importReq.status, importReq.ms + 'ms', importReq.body.substring(0, 400));
  let importTaskId;
  try { importTaskId = JSON.parse(importReq.body).taskId || JSON.parse(importReq.body).id; } catch {}
  if (importTaskId) {
    const start = Date.now();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await httpReq('GET', '/api/import-tasks/' + importTaskId, STAFF);
      const obj = JSON.parse(s.body);
      console.log(`  poll ${i}: status=${obj.status} success=${obj.successCount||obj.success} fail=${obj.failCount||obj.fail} elapsed=${Date.now() - start}ms`);
      if (obj.status === 'done' || obj.status === 'failed' || obj.status === 'completed') {
        console.log('  最终结果:', obj);
        break;
      }
    }
  } else {
    console.log('未拿到 importTaskId');
  }
})().catch(e => { console.error(e); process.exit(1); });
