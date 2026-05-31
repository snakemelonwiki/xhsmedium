# 后端稳定性改进实施报告

根据 `doc/运营中台四端口-当前问题.md` 第六节要求实施的后端改进。

## 改进目标

确保 30-50 人并发时：
- 列表接口响应时间 < 2 秒
- 提交接口响应时间 < 3 秒
- 无数据丢失、无卡死、支持长时间使用

## 已实施的改进

### 1. 分页支持（已完成）

所有列表接口已支持分页，默认每页 20 条：

**已分页的接口：**
- `GET /api/leads` - 客资列表
- `GET /api/leads/tomorrow-followups` - 明日跟进列表
- `GET /api/leads/passive/candidates` - 被动添加候选列表
- `GET /api/leads/:id/follow-records` - 跟进记录列表
- `GET /api/posts` - 作品列表
- `GET /api/lead-drafts` - 草稿列表

**使用方式：**
```javascript
// 分页请求
GET /api/leads?limit=20&offset=0

// 返回格式
{
  items: [...],
  total: 100,
  limit: 20,
  offset: 0
}

// 兼容旧前端（不传分页参数返回数组）
GET /api/leads
// 返回: [...]
```

### 2. Token 自动续期机制（新增）

**文件：** `backend/src/common/token-refresh.interceptor.ts`

**功能：**
- JWT Token 默认有效期从 2 小时延长至 8 小时
- 当 Token 剩余时间少于 30 分钟时自动续期
- 新 Token 通过响应头 `X-New-Token` 返回
- 前端可监听该响应头自动更新本地 Token

**新增接口：**
```
POST /api/auth/refresh
Authorization: Bearer <token>

返回: { token: "new_jwt_token" }
```

### 3. 请求防抖机制（新增）

**文件：** `backend/src/common/debounce.guard.ts`

**功能：**
- 同一用户对同一接口的请求间隔必须 > 1 秒
- 防止重复提交和误操作
- 自动清理过期记录，避免内存泄漏

**应用范围：**
- `POST /api/leads` - 创建客资
- `PUT /api/leads/:id` - 更新客资
- `PUT /api/leads/:id/board` - 更新看板状态
- `POST /api/posts` - 创建作品
- `PUT /api/posts/:id` - 更新作品

**错误响应：**
```json
{
  "statusCode": 429,
  "message": "请求过于频繁，请稍后再试"
}
```

### 4. 数据库索引优化（新增）

**文件：** `backend/migrations/add-performance-indexes.sql`

**新增索引：**

```sql
-- 客资表优化
ALTER TABLE leads ADD INDEX idx_leads_employee_created (employee_id, created_at DESC);
ALTER TABLE leads ADD INDEX idx_leads_sales_process (assigned_sales_user_id, process_status, created_at DESC);
ALTER TABLE leads ADD INDEX idx_leads_next_follow (next_follow_time, assigned_sales_user_id);

-- 作品表优化
ALTER TABLE posts ADD INDEX idx_posts_employee_published (employee_id, published_at DESC, created_at DESC);
ALTER TABLE posts ADD INDEX idx_posts_account_published (account_id, published_at DESC);

-- 跟进记录表优化
ALTER TABLE lead_follow_records ADD INDEX idx_follow_lead_created (lead_id, created_at DESC);

-- 草稿表优化
ALTER TABLE lead_drafts ADD INDEX idx_drafts_user_type_updated (user_id, draft_type, updated_at DESC);

-- 通知表优化
ALTER TABLE notifications ADD INDEX idx_notify_receiver_read_created (receiver_id, read_status, created_at DESC);

-- 指标表优化
ALTER TABLE post_metrics ADD INDEX idx_metrics_post_collected (post_id, collected_at DESC);
```

**执行方式：**
```bash
mysql -u root -p lan_dual_role_system < backend/migrations/add-performance-indexes.sql
```

### 5. 数据库连接池优化（新增）

**文件：** `backend/src/app.module.ts`

**配置：**
```typescript
extra: {
  connectionLimit: 50,        // 最大连接数 50（原 10）
  waitForConnections: true,   // 连接池满时等待
  queueLimit: 0,              // 无限队列
  connectTimeout: 10000,      // 连接超时 10 秒
}
```

### 6. 草稿保存接口（已完成）

**已实现功能：**
- 实时保存草稿到数据库（`lead_drafts` 表）
- 每个用户每种类型最多保留 10 条草稿
- 支持图片 URL 数组存储
- 自动清理旧草稿

**接口：**
```
PUT /api/lead-drafts/:id
{
  draftType: "lead",
  contentJson: "{...}",
  imageUrls: ["url1", "url2"]
}
```

## 部署步骤

### 1. 执行数据库索引迁移

```bash
cd /d/pycharmProjects/xhsmedium_github
mysql -u root -p lan_dual_role_system < backend/migrations/add-performance-indexes.sql
```

### 2. 重新编译 NestJS 后端

```bash
cd backend
npm run build
```

### 3. 重启服务

```bash
pm2 restart ecosystem.config.js
```

### 4. 验证改进

**检查 Token 续期：**
```bash
# 观察响应头是否包含 X-New-Token
curl -H "Authorization: Bearer <token>" http://localhost:8089/api/auth/me -v
```

**检查防抖：**
```bash
# 快速连续请求应返回 429
curl -X POST http://localhost:8089/api/leads -H "Authorization: Bearer <token>" -d '{...}'
curl -X POST http://localhost:8089/api/leads -H "Authorization: Bearer <token>" -d '{...}'
```

**检查分页：**
```bash
# 应返回 { items, total, limit, offset }
curl "http://localhost:8089/api/leads?limit=20&offset=0" -H "Authorization: Bearer <token>"
```

**检查索引：**
```sql
SHOW INDEX FROM leads;
SHOW INDEX FROM posts;
```

## 前端配套改造建议

### 1. Token 自动续期

```javascript
// 在 axios 响应拦截器中
axios.interceptors.response.use(response => {
  const newToken = response.headers['x-new-token'];
  if (newToken) {
    localStorage.setItem('token', newToken);
    console.log('Token 已自动续期');
  }
  return response;
});
```

### 2. 防抖提示

```javascript
// 捕获 429 错误
axios.interceptors.response.use(null, error => {
  if (error.response?.status === 429) {
    showToast('操作过于频繁，请稍后再试');
  }
  return Promise.reject(error);
});
```

### 3. 分页加载

```javascript
// 使用分页参数
async function loadLeads(page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const res = await api(`/api/leads?limit=${pageSize}&offset=${offset}`);
  return res; // { items, total, limit, offset }
}
```

## 性能预期

### 改进前
- 列表查询：2-5 秒（全表扫描）
- 提交操作：1-3 秒
- 并发能力：10-15 人
- Token 有效期：2 小时

### 改进后
- 列表查询：< 1 秒（索引优化 + 分页）
- 提交操作：< 2 秒（连接池优化 + 防抖）
- 并发能力：30-50 人
- Token 有效期：8 小时（自动续期）

## 监控建议

### 1. 数据库慢查询

```sql
-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- 查看慢查询
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;
```

### 2. 连接池状态

```bash
# 查看 MySQL 连接数
mysql> SHOW PROCESSLIST;
mysql> SHOW STATUS LIKE 'Threads_connected';
```

### 3. 应用日志

```bash
# 查看 NestJS 日志
pm2 logs backend

# 查看 SQL 执行日志（已启用 FormattedSqlLogger）
tail -f backend/logs/sql.log
```

## 注意事项

1. **索引维护**：新增索引后首次查询可能较慢，MySQL 需要预热索引
2. **连接池监控**：如果出现连接池耗尽，考虑进一步增加 `connectionLimit`
3. **Token 续期**：前端必须监听 `X-New-Token` 响应头并更新本地存储
4. **防抖时间**：当前设置为 1 秒，可根据实际情况调整 `DEBOUNCE_TIME`
5. **分页兼容**：旧前端不传分页参数时仍返回数组，保持向后兼容

## 验收标准

- [x] 所有列表接口支持分页（每页 20 条）
- [x] Token 自动续期机制（剩余 < 30 分钟时续期）
- [x] 请求防抖机制（1 秒间隔）
- [x] 数据库索引优化（6 组复合索引）
- [x] 连接池优化（50 连接）
- [x] 草稿保存接口（已实现）
- [ ] 30-50 人并发压测（需部署后测试）
- [ ] 列表响应 < 2 秒（需部署后测试）
- [ ] 提交响应 < 3 秒（需部署后测试）
