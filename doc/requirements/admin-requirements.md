# 教务主管端 (Admin) 角色需求文档

> 基于代码分析生成 | 适用版本: v1.3+ | 生成日期: 2026-06-29

## 1. 系统概述

### 1.1 角色定义
- **教务主管端 (Admin Role)**: 系统的超级管理员角色，拥有最高权限
- **角色字段**: `'admin'` (在 user 表中通过 `role` 字段标识)
- **同权角色**: `'owner'` (系统所有者), `'supervisor'` (运营主管)
- **权限特征**: 
  - 可以访问所有数据（不受数据范围限制）
  - 可以执行所有管理操作（创建、修改、删除、导出）
  - 可以查看所有统计报表和操作日志
  - 可以管理系统用户和员工作业

### 1.2 技术栈
- **框架**: NestJS (Node.js)
- **ORM**: TypeORM
- **数据库**: MySQL (utf8mb4)
- **缓存**: 5分钟TTL内存缓存（Dashboard模块）
- **异步任务**: BullMQ + Redis (fallback 到 setImmediate)
- **WebSocket**: 通知推送

---

## 2. 模块功能详述

### 2.1 用户管理模块 (Users)

#### 2.1.1 功能描述
管理员可以管理系统中的所有用户账号，包括创建、编辑、启用/禁用、重置密码等操作。

#### 2.1.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/users` | 获取用户列表（分页+筛选） | admin/owner |
| GET | `/users/:id` | 获取单个用户详情 | admin/owner |
| POST | `/users` | 创建用户 | admin only |
| GET | `/users/staff` | 获取员工作业用户列表 | admin/owner |
| POST | `/users/staff` | 创建员工作业用户 | admin/owner |
| PATCH | `/users/:id` | 更新用户信息 | admin/owner |
| PATCH | `/users/:id/status` | 更新用户状态（启用/禁用） | admin/owner + 操作日志 |
| PATCH | `/users/self/capacity` | 切换销售容量暂停状态 | sales自身/admin |
| PATCH | `/users/self/change-password` | 修改自己的密码 | 所有用户 |

#### 2.1.3 业务逻辑

**用户角色枚举**:
```typescript
['operation', 'sales', 'academic', 'academic_supervisor', 'admin', 'supervisor', 'staff', 'owner']
```

**密码安全**:
- `normalizePasswordForStorage()`: 使用 bcrypt 哈希密码
- 支持向后兼容（旧密码格式自动升级）
- `assertPasswordStrength()`: 要求 8-20 字符，无空格，至少2种字符类型

**销售容量管理**:
- `toggleCapacityPaused()`: 暂停/恢复销售接单能力
- 1小时自动恢复机制（防止销售永久离线）

#### 2.1.4 数据模型
```typescript
interface User {
  id: string;
  username: string;
  password: string; // bcrypt 哈希
  role: 'admin' | 'owner' | 'supervisor' | 'sales' | 'operation' | 'academic' | 'academic_supervisor' | 'staff';
  status: 'active' | 'inactive' | 'locked';
  capacityPaused: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 2.2 员工作业管理模块 (Employees)

#### 2.2.1 功能描述
管理员可以管理系统中的员工作业信息，包括创建、编辑、软删除、重置密码等。员工作业与系统用户账号可关联。

#### 2.2.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/employees` | 获取员工作业列表（分页+筛选） | admin/supervisor/owner |
| GET | `/employees/:id` | 获取单个员工作业详情 | admin/supervisor/owner |
| POST | `/employees` | 创建员工作业（可附带创建登录账号） | admin/supervisor/owner |
| PUT/PATCH | `/employees/:id` | 更新员工作业（可同步更新登录账号） | admin/supervisor/owner |
| PATCH | `/employees/:id/status` | 更新员工作业状态 | admin/supervisor/owner |
| DELETE | `/employees/:id` | 软删除员工作业 | admin/supervisor/owner |
| POST | `/employees/:id/reset-password` | 重置员工作业密码 | admin/supervisor/owner |

#### 2.2.3 业务逻辑

**员工作业状态**:
- `'在职'` - 正常在职
- `'离职'` - 已离职
- `'停用'` - 账号停用（软删除状态）

**创建员工作业时自动创建登录账号**:
- `createWithLogin()`: 创建员工作业 + 自动生成用户名/密码
- 用户名规则: `姓全拼+名首字母+序号` (如 `zhangsan01`)
- 密码规则: 随机生成8位字母数字组合

**更新时同步用户账号**:
- `updateWithLogin()`: 同步更新关联的 user 账号状态
- 软删除时自动停用关联用户账号

**密码重置**:
- `resetPassword()`: bcrypt 哈希新密码，解锁被锁定的账号

#### 2.2.4 数据模型
```typescript
interface Employee {
  id: string;
  name: string;
  phone: string;
  email: string;
  department: string;
  position: string;
  status: '在职' | '离职' | '停用';
  userId: string; // 关联的 user 账号ID
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 2.3 客资管理模块 (Leads)

#### 2.3.1 功能描述
管理员可以查看和管理所有客资（潜在客户），包括筛选、分配、跟进、状态变更等。管理员不受数据范围限制，可查看全部客资。

#### 2.3.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/leads` | 获取客资列表（复杂筛选） | 所有角色（范围控制） |
| GET | `/leads/stats` | 客资统计聚合 | 所有角色 |
| GET | `/leads/aggregate-by-post` | 按帖子聚合客资 | 所有角色 |
| GET | `/leads/tomorrow-followups` | 明日待跟进提醒 | 所有角色 |
| POST | `/leads` | 创建客资（支持自动分配） | 所有角色 |
| GET | `/leads/:id` | 获取单个客资详情 | 所有角色 |
| PUT | `/leads/:id` | 完整更新客资 | 所有角色 |
| PUT | `/leads/:id/board` | 看板式更新（状态、分配等） | 所有角色 |
| PATCH | `/leads/:id/status` | 更新客资状态 | 所有角色 |
| PATCH | `/leads/:id/contact` | 更新联系方式 | 所有角色 |
| GET | `/leads/:id/follow-records` | 获取跟进记录 | 所有角色 |
| POST | `/leads/:id/follow-records` | 添加跟进记录 | 所有角色 |
| POST | `/leads/:id/follow-ups` | 添加跟进记录（别名） | 所有角色 |
| PATCH | `/leads/:id/deal-status` | 更新成交状态 | 所有角色 |
| PATCH | `/leads/:id/intention-level` | 更新意向等级 | 所有角色 |
| POST | `/leads/:id/collaboration` | 创建协作任务 | 所有角色 |
| POST | `/leads/:id/remind` | 发送提醒 | 所有角色 |
| POST | `/leads/:id/source-confirm` | 确认来源 | 所有角色 |
| POST | `/leads/:id/reassign` | 重新分配给不同销售 | admin/owner/supervisor |
| DELETE | `/leads/:id` | 删除客资 | admin/owner |

#### 2.3.3 业务逻辑

**数据范围控制 (resolveScope)**:
- admin/owner/supervisor: `scope = 'all'` - 查看所有客资
- sales/operation/academic: `scope = 'self'` - 仅查看自己的客资

**客资状态流转**:
```
new (新客资)
  -> assigned (已分配)
  -> in_followup (跟进中)
  -> in_collaboration (协作中)
  -> operation_handled (运营已处理)
  -> added_success (已添加成功)
  -> deal_done (已成交)
  -> invalid (无效)
```

**处理状态 (processStatus)**:
- `not_contacted` - 未联系
- `waiting_pass` - 等待通过
- `communicating` - 沟通中
- `quoted` - 已报价
- `deal_pending` - 待成交
- `deal_done` - 已成交
- `invalid` - 无效

**添加状态 (addStatus)**:
- `not_added` - 未添加
- `applied` - 已申请
- `not_passed` - 未通过
- `operation_reminded` - 运营已提醒
- `added` - 已添加

**成交状态 (dealStatus)**:
- `not_deal` - 未成交
- `deal_pending` - 待成交
- `deal_done` - 已成交
- `refunded` - 已退款
- `invalid` - 无效

**意向等级 (intentionLevel)**:
- `high` - 高
- `mid` - 中
- `low` - 低
- `invalid` - 无效
- `pending` - 待定

**自动分配销售**:
- `autoAssignSales()`: 轮询分配，考虑销售容量暂停状态
- 支持容量暂停机制（1小时自动恢复）

---

### 2.4 订单管理模块 (Orders)

#### 2.4.1 功能描述
管理员可以管理所有订单，包括查看、创建、更新、删除、交接等操作。订单模块是核心业务模块，支持复杂的状态流转和交接流程。

#### 2.4.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| POST | `/leads/:id/close-deal` | 成交客资并创建订单 | sales/admin |
| POST | `/academic/orders` | 教务端直接创建订单 | academic |
| GET | `/academic/home-summary` | 教务端首页汇总（6卡片） | academic |
| GET | `/orders` | 获取订单列表 | 所有角色（范围控制） |
| GET | `/orders/check-code` | 检查订单编号唯一性 | 所有角色 |
| GET | `/orders/reminders/pending` | 获取待处理提醒 | 所有角色 |
| POST | `/orders/reminders/scan` | 触发提醒扫描 | admin/owner |
| POST | `/orders/scan-node-timeouts` | 扫描节点超时 | admin/owner |
| DELETE | `/orders/:id` | 删除订单 | admin/owner only |
| GET | `/orders/:id` | 获取订单详情 | 所有角色 |
| POST | `/orders/:id/remind-sales-payment` | 提醒销售收款 | admin/owner |
| GET | `/orders/:id/delivery` | 获取交付详情 | 所有角色 |
| PATCH | `/orders/:id/delivery` | 更新交付信息 | 所有角色 |
| PATCH | `/orders/:id` | 更新订单信息 | 所有角色 |
| POST | `/orders/:id/follow-records` | 添加订单跟进记录 | 所有角色 |
| GET | `/orders/:id/follow-records` | 获取订单跟进记录 | 所有角色 |
| GET | `/orders/:id/handover` | 获取交接状态 | 所有角色 |
| POST | `/orders/:id/handover/hand-over` | 发起交接 | sales/admin |
| POST | `/orders/:id/handover/accept` | 接受交接 | academic/admin |
| POST | `/orders/:id/handover/reject` | 拒绝交接 | academic/admin |
| POST | `/orders/:id/abnormal-feedback` | 创建异常反馈 | 所有角色 |
| GET | `/orders/:id/abnormal-feedback` | 获取异常反馈列表 | 所有角色 |
| PATCH | `/orders/:id/abnormal-feedback/:feedbackId/close` | 关闭异常反馈 | admin/owner |
| POST | `/orders/:id/payments` | 添加付款记录 | 所有角色 |

#### 2.4.3 业务逻辑

**订单状态机**:
```
pending_accept (待接单)
  -> to_receive (待接收)
  -> in_progress (进行中)
  -> awaiting_client_info (等待客户资料)
  -> client_info_completed (客户资料已完成)
  -> awaiting_teacher (等待分配教师)
  -> teacher_assigned (教师已分配)
  -> to_deliver (待交付)
  -> completed (已完成)
  -> abnormal (异常)
  -> closed (已关闭)
```

**交接状态 (Handover Status)**:
```
pending (待交接)
  -> handed_over (已交接)
    -> accepted (已接受)
    -> rejected (已拒绝)
```

**成交流程 (closeDeal)**:
1. 开启数据库事务
2. 创建订单记录
3. 创建财务记录 (order_finance)
4. 创建订单跟进记录
5. 更新客资状态为 `deal_done`
6. 提交事务

**数据范围控制**:
- admin/owner: 查看所有订单
- sales: 查看自己创建的订单
- academic: 查看池中订单 + 已分配给自己的订单

**教务端首页汇总 (6卡片)**:
- `pendingReceive` - 待接收订单数
- `inProgress` - 进行中订单数
- `waitingMaterial` - 等待材料订单数
- `waitingTeacher` - 等待教师订单数
- `nearDue` - 即将到期订单数
- `abnormal` - 异常订单数

---

### 2.5 仪表盘模块 (Dashboard)

#### 2.5.1 功能描述
管理员可以查看系统的整体数据仪表盘，包括每日汇总、个人仪表盘、主管概览等。数据支持5分钟缓存以提高性能。

#### 2.5.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/dashboard/summary` | 每日数据汇总 | 所有角色 |
| GET | `/dashboard/post-type-distribution` | 帖子类型分布（饼图） | 所有角色 |
| GET | `/dashboard/personal` | 个人仪表盘 | 所有角色 |
| GET | `/dashboard/personal/overview` | 个人概览（含指标） | 所有角色 |
| GET | `/dashboard/personal/rankings` | 个人排行榜 | 所有角色 |
| GET | `/dashboard/personal/today` | 个人今日数据 | 所有角色 |
| GET | `/dashboard/personal/platform-distribution` | 个人平台分布 | 所有角色 |
| GET | `/dashboard/personal/platform-trend` | 个人平台趋势 | 所有角色 |
| GET | `/dashboard/personal/account/:accountId/timeseries` | 账号时间序列数据 | 所有角色 |
| GET | `/dashboard/personal/accounts/timeseries` | 所有账号时间序列 | 所有角色 |
| GET | `/dashboard/supervisor/employee/:id` | 主管查看员工作业仪表盘 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/employee/:id/overview` | 主管查看员工作业概览 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/employee/:id/rankings` | 主管查看员工作业排行 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/employee/:id/today` | 主管查看员工作业今日 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/overview` | 主管概览 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/overview/extended` | 主管扩展概览 | supervisor/admin/owner |
| GET | `/dashboard/supervisor/analysis` | 主管分析数据 | supervisor/admin/owner |
| POST | `/dashboard/refresh-entered-data` | 刷新数据 | 所有角色 |
| POST | `/dashboard/invalidate-cache` | 使缓存失效 | admin/owner/supervisor |

#### 2.5.3 业务逻辑

**个人概览指标**:
- `totalTraffic` - 总流量
- `totalLeads` - 总客资数
- `monthPostCount` - 本月发帖数
- `monthLeadCount` - 本月客资数
- `monthTraffic` - 本月流量
- `monthLeadPostCount` - 本月客资帖子数

**个人排行榜**:
- `traffic` - 流量排行
- `efficiency` - 效率排行
- `leadEfficiency` - 客资效率排行

**主管概览指标**:
- `postCount` - 帖子数
- `leadCount` - 客资数
- `likes` - 点赞数
- `interactions` - 互动数
- `effectiveAccountCount` - 有效账号数
- `dealCount` - 成交数
- `pendingCollaborationCount` - 待协作数
- `riskReminders` - 风险提醒

**主管扩展概览 (7大维度)**:
1. `platformDistribution` - 平台分布
2. `postVolumeTrend` - 发帖量趋势
3. `postTypeDistribution` - 帖子类型分布
4. `leadTrend` - 客资趋势
5. `trafficTrend` - 流量趋势
6. `leadEfficiency` - 客资效率
7. `leadPostEfficiency` - 客资帖子效率

---

### 2.6 排行榜模块 (Rankings)

#### 2.6.1 功能描述
管理员可以查看系统内的各类排行榜，包括作品数榜、客资榜、流量榜、学习榜等。支持多种时间周期和平台筛选。

#### 2.6.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/rankings` | 获取排行榜数据 | 所有角色 |
| GET | `/rankings/operations` | 运营端排行榜（分页） | 所有角色 |
| GET | `/rankings/learning-posts` | 学习榜Top10作品 | 所有角色 |

#### 2.6.3 业务逻辑

**排行榜类型**:
- `posts` - 作品数榜（排除删除、重复、无效作品）
- `leads` - 客资榜（排除重复、无联系方式且不可跟进客资）
- `traffic` - 流量榜（按点赞+评论+收藏排序）
- `study` - 学习榜（按客资数优先，相同再看获客效率和点赞数）

**支持的时间周期**:
- `today` - 今日
- `week` / `thisweek` - 本周
- `month` / `thismonth` - 本月
- `thisyear` / `1y` - 本年/近1年
- `total` / `all` / `累计` - 累计
- `7d` / `14d` / `30d` / `90d` - 近N天
- `3y` - 近3年

**平台筛选**:
- `xiaohongshu` / `xiaohongshu` / `小红书`
- `douyin` / `抖音`

---

### 2.7 操作日志模块 (Operation Logs)

#### 2.7.1 功能描述
系统记录所有关键操作日志，管理员可以查看所有用户的操作记录，用于审计和追溯。

#### 2.7.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/operation-logs` | 获取操作日志列表 | admin/owner（看全部），其他（看自己） |
| GET | `/operation-logs/:id` | 获取单条操作日志 | 所有角色 |

#### 2.7.3 业务逻辑

**权限控制**:
- admin/owner: 查看所有操作日志
- staff/sales/academic/supervisor: 仅查看自己的操作日志

**日志字段**:
- `userId` - 操作用户ID
- `targetType` - 目标类型（user, lead, order, employee 等）
- `targetId` - 目标ID
- `action` - 操作动作（create, update, delete, status_change 等）
- `oldValue` - 旧值
- `newValue` - 新值
- `ipAddress` - IP地址
- `userAgent` - 用户代理
- `createdAt` - 操作时间

---

### 2.8 通知模块 (Notifications)

#### 2.8.1 功能描述
系统通过 WebSocket 向用户推送实时通知，管理员可以查看和管理通知。

#### 2.8.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/notifications/unread-count` | 获取未读通知数（按类型） | 所有角色 |
| GET | `/notifications/unread-by-sender` | 获取未读通知（按发送者分组） | 所有角色 |
| GET | `/notifications` | 获取通知列表 | 所有角色 |
| POST | `/notifications/:id/read` | 标记单条已读 | 所有角色 |
| POST | `/notifications/read-all` | 标记全部已读 | 所有角色 |
| POST | `/notifications/mark-read` | 批量标记已读 | 所有角色 |
| POST | `/notifications/mark-all-read` | 按类型标记全部已读 | 所有角色 |

#### 2.8.3 业务逻辑

**通知类型**:
- `reminder` - 提醒通知
- `system` - 系统通知
- `message` - 消息通知

**WebSocket推送**:
- `create()`: 批量创建通知，通过 WebSocket 网关实时推送给在线用户
- 支持按用户ID精准推送

---

### 2.9 导入模块 (Imports)

#### 2.9.1 功能描述
管理员可以通过粘贴或文件上传的方式批量导入客资和帖子数据。导入采用异步任务处理，支持大数量数据。

#### 2.9.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| POST | `/leads/import-paste` | 粘贴导入客资 | admin/owner/supervisor |
| POST | `/leads/import` | 文件导入客资 | admin/owner/supervisor |
| POST | `/posts/import-paste` | 粘贴导入帖子 | admin/owner/supervisor |
| POST | `/posts/import` | 文件导入帖子 | admin/owner/supervisor |
| GET | `/import-tasks/:id` | 获取导入任务状态 | 所有角色 |
| GET | `/import-tasks` | 获取导入任务列表 | 所有角色 |

#### 2.9.3 业务逻辑

**异步处理架构**:
- 使用 BullMQ + Redis 处理异步任务
- Redis 不可用时 fallback 到 `setImmediate`
- `enqueueImport()`: 创建导入任务并加入队列

**客资导入验证**:
- `normalizeContact()`: 清洗联系方式（去除+86、微信等前缀）
- 30天重复检测（同一联系方式30天内不可重复导入）
- 批量插入时使用 savepoints 保证数据一致性

**导入任务状态**:
- `pending` - 待处理
- `processing` - 处理中
- `completed` - 已完成
- `failed` - 失败

---

### 2.10 导出模块 (Exports)

#### 2.10.1 功能描述
管理员可以导出系统中的各类数据（客资、订单、帖子等），支持按角色控制可导出类型和数据范围。

#### 2.10.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| POST | `/exports` | 创建导出任务 | admin/owner/supervisor（全类型），其他（受限类型） |
| GET | `/exports` | 获取导出任务列表 | 所有角色 |
| GET | `/exports/:id` | 获取导出任务详情 | 所有角色 |
| GET | `/exports/:id/download` | 下载导出文件 | 所有角色 |

#### 2.10.3 业务逻辑

**导出类型白名单**:
- admin/owner/supervisor: 可导出所有类型（leads, orders, order_progress, collaboration_records, posts, rankings, accounts）
- staff/sales/academic: 只能导出受限类型

**数据脱敏**:
- `buildLeadsCsv()`: 管理员看完整联系方式，其他角色看脱敏联系方式（如 `138****1234`）
- `buildOrdersCsv()`: 按角色控制可见数据范围
- `buildPostsCsv()`: 非管理员只能查看自己的帖子

**异步导出**:
- 使用 BullMQ + Redis 处理异步导出任务
- 生成 CSV 文件后提供下载链接

---

### 2.11 数据分析模块 (Analytics)

#### 2.11.1 功能描述
管理员可以查看系统的数据分析快照，包括每日帖子数和客资数统计。

#### 2.11.2 API 端点

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/analytics/snapshots` | 获取每日数据快照 | 所有角色 |

#### 2.11.3 业务逻辑

**数据快照**:
- 30秒缓存
- 按天聚合帖子和客资数量
- 支持日期范围筛选

---

## 3. 权限控制矩阵

### 3.1 角色权限对照表

| 功能模块 | admin | owner | supervisor | sales | operation | academic |
|----------|-------|-------|------------|-------|-----------|----------|
| 用户管理 | 全部 | 全部 | 查看 | - | - | - |
| 员工作业管理 | 全部 | 全部 | 全部 | - | - | - |
| 客资查看范围 | 全部 | 全部 | 全部 | 自己的 | 自己的 | 自己的 |
| 客资分配/重分配 | 是 | 是 | 是 | - | - | - |
| 订单查看范围 | 全部 | 全部 | 全部 | 自己的 | - | 池中+自己的 |
| 订单删除 | 是 | 是 | - | - | - | - |
| 交接管理 | 是 | 是 | - | - | - | - |
| 仪表盘-个人 | 是 | 是 | 是 | 是 | 是 | 是 |
| 仪表盘-主管 | 是 | 是 | 是 | - | - | - |
| 排行榜 | 是 | 是 | 是 | 是 | 是 | 是 |
| 操作日志 | 全部 | 全部 | 自己的 | 自己的 | 自己的 | 自己的 |
| 导入数据 | 是 | 是 | 是 | - | - | - |
| 导出数据 | 全部类型 | 全部类型 | 全部类型 | 受限类型 | - | - |
| 数据分析 | 是 | 是 | 是 | 是 | 是 | 是 |

---

## 4. 核心业务流

### 4.1 客资成交流程

```
1. 销售在 Leads 模块跟进客资
2. 客资状态达到可成交条件
3. 调用 POST /leads/:id/close-deal
   - 创建 Order 记录
   - 创建 OrderFinance 记录
   - 创建 OrderFollowRecord 记录
   - 更新 Lead 状态为 deal_done
4. 订单进入 pending_accept 状态
5. 教务端接收订单（或系统自动分配）
6. 订单状态流转至 in_progress
7. 完成服务后状态更新至 completed
```

### 4.2 订单交接流程

```
1. 销售发起交接 POST /orders/:id/handover/hand-over
   - 订单状态变为 handed_over
2. 教务端处理交接：
   a. 接受: POST /orders/:id/handover/accept
      - 状态变为 accepted
      - 订单进入 to_receive
   b. 拒绝: POST /orders/:id/handover/reject
      - 状态变为 rejected
      - 订单返回 sales
```

### 4.3 客资自动分配流程

```
1. 创建客资时 autoAssignSales = true
2. 系统查询可用销售列表
3. 排除 capacityPaused = true 的销售
4. 轮询选择下一个可用销售
5. 更新客资 employeeId
6. 客资状态变为 assigned
```

---

## 5. 关键实体关系

```
User (用户)
  ├── Employee (员工作业) [1:1 或 1:N]
  ├── Lead (客资) [1:N]
  ├── Order (订单) [1:N]
  ├── OperationLog (操作日志) [1:N]
  └── Notification (通知) [1:N]

Employee (员工作业)
  ├── Post (帖子) [1:N]
  ├── Lead (客资) [1:N]
  └── Order (订单) [1:N]

Lead (客资)
  ├── Post (来源帖子) [N:1]
  ├── Order (关联订单) [1:1]
  └── FollowRecord (跟进记录) [1:N]

Order (订单)
  ├── Lead (来源客资) [N:1]
  ├── OrderFinance (财务记录) [1:1]
  ├── OrderFollowRecord (跟进记录) [1:N]
  └── AbnormalFeedback (异常反馈) [1:N]
```

---

## 6. 系统约束与规则

### 6.1 数据范围规则
- **管理员/所有者/主管**: 查看所有数据
- **销售**: 查看自己的客资和订单
- **运营**: 查看自己的客资
- **教务**: 查看池中订单 + 已分配给自己的订单

### 6.2 并发控制
- 客资自动分配时使用乐观锁防止重复分配
- 订单状态变更时使用数据库事务保证一致性

### 6.3 数据一致性
- 员工作业状态变更时同步更新关联用户账号状态
- 客资成交时同时创建订单和财务记录（事务内）
- 软删除员工作业时停用关联用户账号

### 6.4 缓存策略
- Dashboard 数据缓存5分钟
- Analytics 快照缓存30秒
- 缓存失效: 手动调用 `/dashboard/invalidate-cache`

---

## 7. 附录

### 7.1 状态枚举汇总

**用户状态**:
- `active` - 正常
- `inactive` - 禁用
- `locked` - 锁定

**员工作业状态**:
- `在职` - 正常在职
- `离职` - 已离职
- `停用` - 账号停用

**客资状态**:
- `new` - 新客资
- `assigned` - 已分配
- `in_followup` - 跟进中
- `in_collaboration` - 协作中
- `operation_handled` - 运营已处理
- `added_success` - 已添加成功
- `deal_done` - 已成交
- `invalid` - 无效

**订单状态**:
- `pending_accept` - 待接单
- `to_receive` - 待接收
- `in_progress` - 进行中
- `awaiting_client_info` - 等待客户资料
- `client_info_completed` - 客户资料已完成
- `awaiting_teacher` - 等待分配教师
- `teacher_assigned` - 教师已分配
- `to_deliver` - 待交付
- `completed` - 已完成
- `abnormal` - 异常
- `closed` - 已关闭

**交接状态**:
- `pending` - 待交接
- `handed_over` - 已交接
- `accepted` - 已接受
- `rejected` - 已拒绝

### 7.2 平台枚举
- `xiaohongshu` / `xhs` / `小红书` - 小红书
- `douyin` / `抖音` - 抖音

### 7.3 时间周期枚举
- `today` - 今日
- `week` / `thisweek` - 本周
- `month` / `thismonth` - 本月
- `thisyear` / `1y` - 本年/近1年
- `7d` / `14d` / `30d` / `90d` - 近N天
- `3y` - 近3年
- `total` / `all` / `累计` - 累计

---

*文档生成时间: 2026-06-29*
*适用版本: v1.3+*
*维护角色: 教务主管(Admin)*
