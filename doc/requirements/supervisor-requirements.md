# 运营主管端 (Supervisor) 需求文档

> 本文档详细描述 NestJS 后端系统中 **运营主管(Supervisor)** 角色的所有功能模块。
> 生成日期: 2026-06-29
> 模块路径: `backend/src/modules/`

---

## 角色定义

**运营主管 (supervisor)** 是运营团队的直接管理者，负责:
- 监督团队成员日常工作表现
- 评审作品质量并给予改进建议
- 查看团队整体数据指标
- 管理下属员工档案
- 审批团队相关操作

**角色权限层级:**
- `owner` > `admin` > `supervisor` > `staff` (operation) > `sales` > `academic`
- supervisor 可管理 staff/operation 角色的运营人员，但不可管理 sales/academic 角色


---

## 一、supervisor-suggestions 模块 (主管作品评审建议)

### 1.1 模块职责
主管向运营人员发送评审建议，可关联具体作品、账号、员工或客资。建议通过站内通知推送至对应运营人员。

### 1.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| POST | `/api/supervisor-suggestions` | admin/supervisor/owner | `{targetType, targetId, content}` | 创建主管建议 |
| GET | `/api/supervisor-suggestions` | 登录用户 | `?targetType&employeeId&readStatus` | 查询建议列表；普通运营只能看自己的 |
| PATCH | `/api/supervisor-suggestions/:id/read` | 登录用户 | `{id}` | 标记建议为已读 |
| POST | `/api/supervisor-suggestions/read-all` | 登录用户 | - | 批量标记全部已读 |
| GET | `/api/supervisor-suggestions/unread-count` | 登录用户 | - | 获取未读建议数量 |

### 1.3 Service 层方法
- `create(dto: CreateSuggestionDto): Promise<SupervisorSuggestion>` — 创建建议并发送通知
- `list(query: SuggestionQuery): Promise<SupervisorSuggestion[]>` — 查询建议列表（最多200条）
- `findById(id): Promise<SupervisorSuggestion \| null>` — 获取建议详情
- `markAsRead(id, userId): Promise<boolean>` — 标记单条已读
- `markAllAsRead(userId): Promise<number>` — 批量标记已读
- `getUnreadCount(userId): Promise<number>` — 获取未读数量

### 1.4 业务逻辑
- **目标类型支持**: `post` (作品), `account` (账号), `employee` (员工), `lead` (客资)
- **接收者解析**:
  - `lead` 类型：优先找 assigned_sales_user_id 对应的 sales 角色用户
  - 其他类型：找 employeeId 关联的 staff 角色用户
- **通知机制**: 创建建议后自动发通知给接收者，portType = `sales` 或 `operations`
- **权限控制**: 仅 admin/supervisor/owner 可创建建议；普通运营(staff)只能查看发给自己的建议

### 1.5 DTO/Entity 结构
```typescript
interface CreateSupervisorSuggestionDto {
  operatorId: string;    // 必填，目标运营 users.id
  postId?: string;       // 可选，关联作品
  accountId?: string;    // 可选，关联账号
  content: string;       // 必填，建议正文，≤ 1000 字
}
```

**Entity 字段:**
- `id`, `sender_id`(主管), `receiver_id`(运营), `employee_id`(关联员工)
- `target_type`(post/account/employee/lead), `target_id`, `content`
- `read_status`(0=未读, 1=已读), `created_at`, `updated_at`

---

## 二、rankings 模块 (排行榜 - 主管视角)

### 2.1 模块职责
提供运营团队排行榜，支持作品数、客资数、流量、学习榜四大榜单，按周期筛选。

### 2.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/rankings` | 登录用户 | `?type&date&limit&offset&platform&period&from&to` | 排行榜入口 |
| GET | `/api/rankings/operations` | 登录用户 | `?type&period&limit&offset&platform&from&to` | A端运营排行榜 |
| GET | `/api/rankings/learning-posts` | 登录用户 | `?days` | 学习榜Top10 |

**支持的 type**: `posts`, `leads`, `traffic`, `study`
**支持的 period**: `today`, `week`, `month`, `thisweek`, `thismonth`, `thisyear`, `total`, `7d`, `14d`, `30d`, `90d`, `1y`, `3y`

### 2.3 Service 层方法
- `getRankings(type, date, options): Promise<any[]>` — 获取排行榜数据
- `getRankingsPaged(type, date, limit, offset, options): Promise<{items, total, limit, offset}>` — 分页版
- `getLearningPosts(days, userId): Promise<any[]>` — 学习榜Top10

### 2.4 业务逻辑
- **数据范围**: supervisor 看到**全团队**所有员工的数据（无employeeId过滤）
- **作品数榜**: 排除删除、重复、无效作品
- **客资榜**: 排除重复、无联系方式且不可跟进客资
- **流量榜**: 按 `likes + comments + favorites` 排序
- **学习榜**: 按客资数优先，客资相同再看获客效率和点赞数
- **平台过滤**: 支持 `小红书`/`抖音` 及英文别名 `xhs`/`xiaohongshu`/`douyin`

### 2.5 数据范围差异 (supervisor vs sales)
| 维度 | supervisor 权限 | sales 权限 |
|------|----------------|-----------|
| 排行榜可见范围 | 全团队所有员工 | 仅自己 |
| 数据过滤 | 无employeeId限制 | 按employeeId过滤 |
| 客资范围 | 全部客资 | 仅 assigned_sales_user_id = 自己的 |

---

## 三、employees 模块 (下属员工管理)

### 3.1 模块职责
管理运营团队成员档案，包括基本信息、登录账号、状态控制。

### 3.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/employees` | admin/owner/supervisor | `?limit&offset&keyword&role&status` | 查询员工列表 |
| GET | `/api/employees/:id` | admin/owner/supervisor | `{id}` | 查询员工详情 |
| POST | `/api/employees` | admin/owner/supervisor | `{name, phone, hireDate, status, department, loginRole, loginPassword, createLoginAccount}` | 创建员工 |
| PUT | `/api/employees/:id` | admin/owner/supervisor | `{...}` | 更新员工资料 |
| PATCH | `/api/employees/:id` | admin/owner/supervisor | `{...}` | 兼容PATCH更新 |
| PATCH | `/api/employees/:id/status` | admin/owner/supervisor | `{status}` | 更新员工启停状态 |
| DELETE | `/api/employees/:id` | admin/owner/supervisor | `{id}` | 删除员工（软删除） |
| POST | `/api/employees/:id/reset-password` | admin/owner/supervisor | `{newPassword?}` | 重置登录密码 |
| GET | `/api/employees/check-username/:username` | admin/owner/supervisor | `{username}` | 检查用户名是否存在 |

### 3.3 Service 层方法
- `findAll(keyword?, role?, status?): Promise<any[]>` — 查询全部员工，附角色信息
- `findAllPaged(limit, offset, keyword?, role?, status?): Promise<{items, total, limit, offset}>` — 分页版
- `findById(id): Promise<Employee \| null>` — 按ID查员工
- `createWithLogin(employeeCode, input): Promise<{employee, loginAccount}>` — 创建员工+可选登录账号
- `updateWithLogin(id, input): Promise<Employee>` — 更新员工+同步更新关联user
- `softDelete(id, status?): Promise<Employee>` — 软删除（状态设为停用/离职）
- `resetPassword(id, newPassword?): Promise<{userId, username, newPassword}>` — 重置密码
- `checkUsernameExists(username): Promise<boolean>` — 用户名查重

### 3.4 业务逻辑
- **员工编号生成**: 自动递增 `EMP0001`, `EMP0002`...
- **登录账号自动创建**:
  - 用户名默认: `name_手机号后4位`（小写）
  - 密码默认: 8-12位随机密码（大小写+数字）
  - 角色默认: `staff`（可通过 loginRole 指定）
  - createLoginAccount=false 时不创建登录账号
- **状态同步**: 员工设为"离职"/"停用"时，同步停用关联 user (status='inactive')
- **密码修改**: bcrypt 哈希存储，初始明文仅在创建时返回一次
- **密码强度**: 8-20位，不含空格，至少包含大写/小写/数字/特殊字符中的2种

### 3.5 DTO/Entity 结构
```typescript
interface CreateEmployeeWithLoginInput {
  name: string;              // 必填
  phone?: string | null;     // 可选
  hireDate?: string | null;  // 可选 (YYYY-MM-DD)
  status?: string;          // 默认 '在职'
  department?: string | null; // 部门名称（v1.4新增）
  loginUsername?: string;    // 可选，默认自动生成
  loginPassword?: string;    // 可选，默认随机生成
  loginRole?: string;        // 可选，默认 'staff'
  createLoginAccount?: boolean; // 是否创建登录账号
}
```

**Employee Entity 字段:**
- `id`(UUID), `employee_code`(唯一), `name`, `phone`, `hire_date`(date), `status`(默认'在职')
- `department`(部门名称, v1.4), `created_at`, `updated_at`


---

## 四、analytics 模块 (团队数据分析)

### 4.1 模块职责
提供最近N天的日聚合数据快照，用于看板趋势展示。

### 4.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/analytics/snapshots` | 登录用户 | `?days` (默认7, 最大90), `?period` | 获取日聚合快照 |

### 4.3 Service 层方法
- `getSnapshots(days = 7): Promise<{snapshots: Record<string, DailySnapshot>}>` — 获取快照

### 4.4 业务逻辑
- **缓存策略**: 30s 进程内缓存 (key = `analytics:snapshots:${userId}:${period}:${days}`)
- **数据聚合**: 每天聚合 `posts` (作品数+流量) 和 `leads` (客资数+成交数)
- **返回结构**: `{ 'YYYY-MM-DD': { posts, leads, deals, traffic } }`

### 4.5 DailySnapshot 结构
```typescript
interface DailySnapshot {
  posts: number;    // 当日发布作品数
  leads: number;    // 当日新增客资数
  deals: number;    // 当日成交数
  traffic: number;  // 当日获客贴流量
}
```

---

## 五、dashboard 模块 (主管数据看板)

### 5.1 模块职责
提供个人看板（运营端）和主管总览（主管端）两类数据看板。

### 5.2 API 端点 - 主管端专用

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/dashboard/supervisor/overview` | admin/supervisor/owner | `?period`(today/week/month)&`from&to` | 主管总览4张卡 |
| GET | `/api/dashboard/supervisor/overview/extended` | admin/supervisor/owner | `?period&from&to&trendPeriod` | 主管总览扩展(7区域) |
| GET | `/api/dashboard/supervisor/analysis` | admin/supervisor/owner | `?platform&employeeId&accountId&from&to` | 主管分析看板 |
| GET | `/api/dashboard/supervisor/employee/:id` | admin/supervisor/owner | `{id}&from&to` | 查看指定员工个人看板 |
| GET | `/api/dashboard/supervisor/employee/:id/overview` | admin/supervisor/owner | `{id}&metrics&platform&period&from&to` | 员工概览卡 |
| GET | `/api/dashboard/supervisor/employee/:id/rankings` | admin/supervisor/owner | `{id}&platform&period&from&to&sort` | 员工效率榜 |
| GET | `/api/dashboard/supervisor/employee/:id/today` | admin/supervisor/owner | `{id}&platform&date` | 员工今日数据 |

### 5.3 API 端点 - 通用（主管也可访问）

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/dashboard/summary` | `?date` | 今日汇总统计 |
| GET | `/api/dashboard/post-type-distribution` | `?date` | 作品类型分布 |
| GET | `/api/dashboard/personal` | `?from&to` | 个人看板 |
| GET | `/api/dashboard/personal/overview` | `?metrics&platform&period&from&to` | 个人概览5卡 |
| GET | `/api/dashboard/personal/rankings` | `?platform&period&from&to&sort` | 三大效率榜 |
| GET | `/api/dashboard/personal/today` | `?platform&date` | 今日数据 |
| GET | `/api/dashboard/personal/platform-distribution` | `?from&to&platform&employeeId` | 双平台分布 |
| GET | `/api/dashboard/personal/platform-trend` | `?period&from&to&employeeId` | 双平台趋势 |
| GET | `/api/dashboard/personal/account/:id/timeseries` | `?days&from&to` | 单账号时间序列 |
| GET | `/api/dashboard/personal/accounts/timeseries` | `?days&from&to&platform&sort&employeeId` | 全部账号时间序列 |
| POST | `/api/dashboard/refresh-entered-data` | - | 刷新今日数据 |
| POST | `/api/dashboard/invalidate-cache` | admin/supervisor/owner | - | 清除看板缓存 |

### 5.4 Service 层方法
- `getSummary(today): Promise<any>` — 今日汇总
- `getPostTypeDistribution(today): Promise<any[]>` — 作品类型占比
- `getPersonalDashboard(employeeId, range): Promise<any>` — 个人看板(兼容v1.2)
- `getPersonalOverview(employeeId, filters): Promise<any>` — 个人概览5卡+排名
- `getPersonalRankings(employeeId, filters): Promise<any>` — 三大效率榜
- `getPersonalToday(employeeId, filters): Promise<any>` — 今日数据
- `getPlatformDistribution(employeeId, range): Promise<any[]>` — 双平台分布
- `getPlatformTrend(employeeId, options): Promise<any>` — 双平台趋势
- `getAccountTimeSeries(accountId, options): Promise<any>` — 单账号日历
- `getAllAccountsTimeSeries(employeeId, options): Promise<any>` — 全部账号日历
- `getSupervisorOverview(period, from?, to?): Promise<any>` — 主管总览
- `getSupervisorExtended(period, from?, to?, trendPeriod?): Promise<any>` — 主管总览扩展
- `getSupervisorAnalysis(filters): Promise<any>` — 主管分析看板
- `rankingRows(date, options): Promise<any[]>` — 排行榜基础行
- `refreshEnteredData(): Promise<any>` — 刷新数据
- `invalidateAll(): void` — 清除所有缓存

### 5.5 主管总览数据结构
```typescript
interface SupervisorOverview {
  period: { from, to, code };
  postCount: number;        // 作品总数
  leadCount: number;        // 客资总数
  likes: number;            // 点赞总数
  interactions: number;     // 互动总数 (likes+comments+favorites)
  effectiveAccountCount: number; // 有效活跃账号数
  dealCount: number;        // 成交数
  pendingCollaborationCount: number; // 待协作数
  riskReminders: {
    collaborationTimeout: number;  // 协作超时
    leadBacklog: number;           // 客资积压
    lowUpdateEmployees: number;    // 低更新员工
    abnormalAccounts: number;      // 异常账号
  };
}
```

### 5.6 主管总览扩展数据结构 (7区域)
```typescript
interface SupervisorExtended {
  platformDistribution: { platform, postCount, leadCount, traffic }[]; // 双平台分布
  postVolumeTrend: { date, xiaohongshuCount, douyinCount }[];           // 作品量趋势
  postTypeDistribution: { type, count, ratio }[];                        // 三类作品占比
  leadTrend: { date, xiaohongshuLeads, douyinLeads }[];                  // 获客趋势
  trafficTrend: { date, xiaohongshuTraffic, douyinTraffic }[];        // 流量趋势
  leadEfficiency: { xiaohongshu, douyin, total };                       // 获客效率
  leadPostEfficiency: { xiaohongshu, douyin, total };                   // 获客帖效率
}
```

### 5.7 主管分析看板数据结构 (8指标)
```typescript
interface SupervisorAnalysis {
  filters: { platform, employeeId, accountId, from, to };
  platformTrend: { date, platform, postCount, likes }[];     // 平台趋势
  postStructure: { type, count }[];                            // 作品结构
  leadTrend: { date, platform, leadCount }[];                  // 获客趋势
  trafficTrend: { date, platform, traffic }[];                // 流量趋势
  efficiencyTrend: { date, platform, postCount, leadCount, efficiency }[];   // 获客效率趋势
  leadEfficiencyTrend: { date, platform, leadPostCount, leadCount, efficiency }[]; // 获客帖效率趋势
  efficiencyRatio: { employeeId, name, postCount, leadCount }[];  // 按员工获客效率
  leadPostRatio: { employeeId, name, leadPostCount, leadCount }[]; // 按员工获客帖效率
}
```

### 5.8 数据范围差异 (supervisor vs staff)
| 功能 | supervisor 权限 | staff 权限 |
|------|----------------|-----------|
| 看板范围 | 全团队所有员工 | 仅自己 |
| 员工概览卡 | 可查看任意员工 `/supervisor/employee/:id/overview` | 只能查看自己 `/personal/overview` |
| 数据过滤 | 支持 employeeId/accountId 全维度过滤 | 仅 employeeId = 当前登录用户 |
| 主管总览 | 全团队聚合数据 | 无权限访问 |
| 主管分析 | 支持全团队分析 | 无权限访问 |


---

## 六、operation-logs 模块 (操作日志)

### 6.1 模块职责
记录系统中所有关键操作（创建、更新、删除、禁用），支持审计查询。

### 6.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/operation-logs` | 登录用户 | `?userId&targetType&targetId&action&from&to&limit&offset` | 查询操作日志 |
| GET | `/api/operation-logs/:id` | 登录用户 | `{id}` | 查看单条日志详情 |

### 6.3 权限策略
- **admin/owner**: 可查看全表所有日志
- **staff/sales/academic/supervisor**: 只能查看自己产生的日志 (user_id = session.userId)
- **越权访问**: 非admin查看他人日志时，接口返回 404（不泄露信息）

### 6.4 Service 层方法
- `log(dto: LogDto): Promise<void>` — 写入日志（内部调用）
- `list(opts: ListOpts): Promise<{items, total}>` — 查询日志列表
- `findOne(id): Promise<any>` — 查看单条日志

### 6.5 DTO/Entity 结构
```typescript
interface LogDto {
  userId: string;       // 操作人ID
  action: string;       // 操作类型: CREATE/UPDATE/DELETE/DISABLE/READ
  targetType: string;   // 目标类型: employee/post/lead/account/order/...
  targetId: string;     // 目标ID
  detail?: string;      // 详情（JSON序列化）
  ip?: string;          // IP地址
}
```

**Entity 字段:**
- `id`, `user_id`, `action`, `target_type`, `target_id`, `detail`(text), `ip`, `created_at`

---

## 七、notifications 模块 (通知)

### 7.1 模块职责
系统站内通知中心，支持按角色(portType)隔离，主管可发送通知给运营人员。

### 7.2 API 端点

| 方法 | 路径 | 权限 | 参数 | 说明 |
|------|------|------|------|------|
| GET | `/api/notifications` | 登录用户 | `?status&type&limit&offset` | 查询通知列表 |
| GET | `/api/notifications/unread-count` | 登录用户 | `?typeCode` | 未读通知数量 |
| GET | `/api/notifications/unread-by-sender` | 登录用户 | - | 按发送者分组的未读提醒 |
| POST | `/api/notifications/:id/read` | 登录用户 | `{id}` | 标记通知已读 |
| PATCH | `/api/notifications/:id/read` | 登录用户 | `{id}` | 标记通知已读(PATCH) |
| POST | `/api/notifications/read-all` | 登录用户 | - | 全部标记已读 |
| POST | `/api/notifications/mark-read` | 登录用户 | `{ids[]}` | 批量标记已读 |
| POST | `/api/notifications/mark-all-read` | 登录用户 | `{typeCode?}` | 按类型全部标记已读 |

### 7.3 Service 层方法
- `listForUser(userId, opts): Promise<{items, unreadCount, total, limit, offset}>` — 查询用户通知
- `countUnread(userId, portType?): Promise<number>` — 未读数量
- `getUnreadCountByType(typeCode, userId): Promise<number>` — 按类型未读数
- `listUnreadBySender(userId, portType?): Promise<{total, senders[]}>` — 按发送者聚合
- `markRead(id, userId): Promise<boolean>` — 单条已读
- `markAllRead(userId, typeCode?): Promise<number>` — 全部已读
- `markReadMany(userId, ids): Promise<number>` — 批量已读
- `create(dto: CreateDto): Promise<void>` — 创建通知（内部调用）

### 7.4 业务逻辑
- **portType 隔离**:
  - `sales` → 销售端
  - `academic` → 教务端
  - `operations` → 运营端/主管端/总后台
- **通知类型**: `supervisor_suggestion`(主管建议), `reminder`(提醒), `collaboration_task`(协作任务), `order`(订单), `export`(导出), `import`(导入)
- **越权检查**: 标记已读时验证当前用户是通知接收者，否则返回 404
- **实时推送**: 通过 WebSocket Gateway 实时推送新通知
- **Route Hint**: 通知携带跳转路由，点击可直接跳转对应页面

### 7.5 DTO/Entity 结构
```typescript
interface CreateDto {
  receiverIds: string[];    // 接收者ID列表
  senderId?: string;         // 发送者ID（可选）
  portType: string;         // 端口类型: sales/academic/operations
  typeCode: string;         // 通知类型编码
  title: string;            // 标题
  content?: string;         // 内容
  relatedId?: string;       // 关联业务ID
  relatedType?: string;     // 关联业务类型
}
```

**Entity 字段:**
- `id`, `receiver_id`, `sender_id`, `port_type`, `type_code`, `title`, `content`, `related_id`, `related_type`
- `read_status`(0=未读, 1=已读), `created_at`, `updated_at`

