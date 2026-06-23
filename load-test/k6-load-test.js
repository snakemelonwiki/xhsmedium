import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');

// 测试配置
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // 预热：10个用户
    { duration: '1m', target: 30 },   // 增加到30个用户
    { duration: '2m', target: 50 },   // 峰值：50个用户
    { duration: '1m', target: 30 },   // 降低到30个用户
    { duration: '30s', target: 0 },   // 冷却
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'], // 95%请求<2s, 99%<3s
    http_req_failed: ['rate<0.05'],                   // 错误率<5%
    errors: ['rate<0.05'],
  },
};

const BASE_URL = 'http://localhost:3000';

// 测试用户池
const TEST_USERS = {
  staff: Array.from({ length: 15 }, (_, i) => ({ username: `staff${i + 1}`, password: 'test123', role: 'staff' })),
  sales: Array.from({ length: 15 }, (_, i) => ({ username: `sales${i + 1}`, password: 'test123', role: 'sales' })),
  admin: Array.from({ length: 5 }, (_, i) => ({ username: `admin${i + 2}`, password: 'test123', role: 'admin' })),
};

// 随机选择用户
function getRandomUser() {
  const roles = ['staff', 'sales', 'admin'];
  const role = roles[Math.floor(Math.random() * roles.length)];
  const users = TEST_USERS[role];
  return users[Math.floor(Math.random() * users.length)];
}

// 登录并获取token
function login(user) {
  const payload = JSON.stringify({
    username: user.username,
    password: user.password,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  };

  const res = http.post(`${BASE_URL}/api/auth/login`, payload, params);

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => r.json('token') !== undefined,
  });

  if (!success) {
    errorRate.add(1);
    return null;
  }

  return res.json('token');
}

// 获取客资列表（分页）
function getLeadsList(token) {
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const res = http.get(`${BASE_URL}/api/leads?limit=10&offset=0`, params);

  const success = check(res, {
    'leads list status 200': (r) => r.status === 200,
    'leads list response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success ? 1 : 0);
  return res;
}

// 获取作品列表（分页）
function getPostsList(token) {
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const res = http.get(`${BASE_URL}/api/posts?limit=10&offset=0`, params);

  const success = check(res, {
    'posts list status 200': (r) => r.status === 200,
    'posts list response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success ? 1 : 0);
  return res;
}

// 创建客资
function createLead(token, accountId) {
  const payload = JSON.stringify({
    accountId: accountId || 'test-account-id',
    platform: '小红书',
    contactInfo: `test${Date.now()}@example.com`,
    nickname: `测试用户${Date.now()}`,
    budget: '5000-10000',
    majorContent: '留学咨询',
    status: '新客资',
    note: '负载测试数据',
  });

  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const res = http.post(`${BASE_URL}/api/leads`, payload, params);

  const success = check(res, {
    'create lead status 200': (r) => r.status === 200,
    'create lead response time < 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!success ? 1 : 0);
  return res;
}

// 创建作品
function createPost(token, accountId) {
  const payload = JSON.stringify({
    accountId: accountId || 'test-account-id',
    platform: '小红书',
    title: `测试作品${Date.now()}`,
    copywriting: '这是负载测试创建的作品',
    postType: '图文',
    postUrl: `https://example.com/post/${Date.now()}`,
    traffic: 0,
    likes: 0,
    comments: 0,
    favorites: 0,
    publishedAt: new Date().toISOString().split('T')[0],
    note: '负载测试数据',
  });

  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const res = http.post(`${BASE_URL}/api/posts`, payload, params);

  const success = check(res, {
    'create post status 200': (r) => r.status === 200,
    'create post response time < 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!success ? 1 : 0);
  return res;
}

// 获取账号列表
function getAccountsList(token) {
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const res = http.get(`${BASE_URL}/api/accounts?limit=10&offset=0`, params);

  const success = check(res, {
    'accounts list status 200': (r) => r.status === 200,
  });

  errorRate.add(!success ? 1 : 0);

  // 返回第一个账号ID用于后续测试
  if (success && res.json('items') && res.json('items').length > 0) {
    return res.json('items')[0].id;
  }
  return null;
}

// 主测试场景
export default function () {
  const user = getRandomUser();

  // 1. 登录
  const token = login(user);
  if (!token) {
    sleep(1);
    return;
  }

  sleep(0.5);

  // 2. 获取账号列表（用于后续创建操作）
  const accountId = getAccountsList(token);
  sleep(0.3);

  // 3. 模拟不同角色的操作
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40%: 查看客资列表
    getLeadsList(token);
    sleep(1);
    getLeadsList(token); // 翻页
  } else if (scenario < 0.7) {
    // 30%: 查看作品列表
    getPostsList(token);
    sleep(1);
    getPostsList(token); // 翻页
  } else if (scenario < 0.85) {
    // 15%: 创建客资
    if (accountId) {
      createLead(token, accountId);
    }
  } else {
    // 15%: 创建作品
    if (accountId) {
      createPost(token, accountId);
    }
  }

  sleep(1);
}

// 测试结束后的汇总
export function handleSummary(data) {
  return {
    'load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors;

  let summary = '\n' + indent + '=== 负载测试报告 ===\n\n';

  // 请求统计
  const httpReqs = data.metrics.http_reqs;
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;

  summary += indent + `总请求数: ${httpReqs.values.count}\n`;
  summary += indent + `请求速率: ${httpReqs.values.rate.toFixed(2)} req/s\n\n`;

  summary += indent + '响应时间:\n';
  summary += indent + `  平均: ${httpReqDuration.values.avg.toFixed(2)}ms\n`;
  summary += indent + `  中位数: ${httpReqDuration.values.med.toFixed(2)}ms\n`;
  summary += indent + `  P95: ${httpReqDuration.values['p(95)'].toFixed(2)}ms\n`;
  summary += indent + `  P99: ${httpReqDuration.values['p(99)'].toFixed(2)}ms\n`;
  summary += indent + `  最大: ${httpReqDuration.values.max.toFixed(2)}ms\n\n`;

  summary += indent + `失败率: ${(httpReqFailed.values.rate * 100).toFixed(2)}%\n`;
  summary += indent + `错误率: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%\n\n`;

  // 阈值检查
  const thresholds = data.thresholds;
  summary += indent + '阈值检查:\n';
  for (const [name, result] of Object.entries(thresholds)) {
    const status = result.ok ? '✓ 通过' : '✗ 失败';
    summary += indent + `  ${name}: ${status}\n`;
  }

  return summary;
}
