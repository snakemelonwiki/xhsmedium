# 教务端 (Academic) 角色需求文档

> 基于代码分析生成 | 适用版本: v1.3+ | 生成日期: 2026-06-29

## 1. 角色定义

- **academic** (普通教务): 执行日常订单跟进、节点提醒、教师分配等操作
- **academic_supervisor** (教务主管): 拥有普通教务权限 + 团队管理 + 主管看板

### 技术栈
- **框架**: NestJS + TypeORM
- **数据库**: MySQL (utf8mb4)
- **模块位置**: `backend/src/modules/`
- **实体位置**: `backend/src/entities/`

---

## 2. 订单模块 (Orders Module)

### 2.1 模块职责
订单模块是教务端最核心的业务模块，负责：
- 教务直接创建订单
- 订单状态流转与交付
- 节点提醒与预警
- 订单交接（handover）流程
- 异常反馈处理
- 财务信息查看（受角色限制）

### 2.2 Controller API 端点

#### 教务专属端点

| HTTP Method | Path | 说明 | 权限要求 |
|-------------|------|------|----------|
| POST | `/api/academic/orders` | 教务直接创建订单 | academic, academic_supervisor |
| GET | `/api/academic/home-summary` | 教务首页6宫格统计 | academic, academic_supervisor |

#### 通用订单端点（教务可访问）

| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/orders` | 查询订单列表（带scope过滤） |
| GET | `/api/orders/:id` | 查看订单详情 |
| POST | `/api/orders/:id/clone` | 克隆订单 |
| PATCH | `/api/orders/:id` | 更新订单信息 |
| PATCH | `/api/orders/:id/delivery` | 更新交付信息 |
| POST | `/api/orders/:id/remind-sales-payment` | 提醒销售催款 |
| POST | `/api/orders/:id/abnormal-feedback` | 提交异常反馈 |
| POST | `/api/orders/:id/hand-over` | 提交订单交接 |
| POST | `/api/orders/:id/accept` | 接受订单交接 |
| POST | `/api/orders/:id/reject` | 拒绝订单交接 |
| GET | `/api/orders/reminders/pending` | 获取待提醒节点列表 |
| POST | `/api/orders/reminders/:id/mark-handled` | 标记提醒已处理 |

### 2.3 Service 层主要业务方法

#### `createAcademicOrder()`
- 教务直接创建订单（区别于销售创建）
- 支持手动指定订单号或自动生成（前缀 `A-` + 时间戳 + 随机数）
- 自动设置 `orderStatus` 为 `to_receive`

#### `getAcademicHomeSummary()`
返回教务首页6宫格统计：
1. **pendingReceive**: 待接收订单数
2. **inProgress**: 进行中订单数
3. **waitingMaterial**: 等待客户材料订单数
4. **waitingTeacher**: 等待分配教师订单数
5. **nearDue**: 即将到期（7天内）节点数
6. **abnormal**: 异常订单数

#### `applyOrdersScope()`
订单可见性范围控制：
- **`pool`**: 未分配教务的订单（`academic_user_id IS NULL`）
- **`assigned`/`mine`**: 当前用户负责的订单
- **默认**: pool + self（教务看全部未分配和自己的）

#### `applyAcademicClaimableFilter()`
教务可接单的硬性条件过滤：
- 必须已付定金（`payment_stage` 包含 "定金"）
- 且 `order_finance.client_paid > 0`
- 未付定金订单对教务不可见

#### `saveOrderDelivery()`
交付信息更新（角色权限控制）：
- 教务交付角色白名单：`['admin', 'owner', 'supervisor', 'academic', 'academic_supervisor']`
- 角色隐藏敏感字段规则：
  - **A-6需求**: 教务角色隐藏订单金额字段（`amount`, `contractAmount`, `paidAmount`, `unpaidAmount`, `refundAmount`）
  - 销售角色隐藏教师支付信息

#### 交接状态机 (Handover State Machine)
- **状态值**: `pending` → `handed_over` → `accepted` | `rejected`
- `handOver()`: 当前负责人提交交接给目标教务
- `acceptHandover()`: 目标教务接受，转移所有权
- `rejectHandover()`: 目标教务拒绝，返回原状态

---

## 3. 节点提醒模块 (Reminders Service)

### 3.1 提醒归一化规则
- **固定提醒时段**: 10:00、15:00、18:00
- `normalizeRemindAt()`: 将任意输入时间归一化到最近的后续固定时段
- 若晚于18:00，则顺延到次日10:00

### 3.2 到期提醒扫描器 (`scanDue`)
- **调度**: 每分钟执行（`CronExpression.EVERY_MINUTE`）
- **扫描条件**: `next_remind_at <= NOW` 且 `reminder_sent_at IS NULL`
- **单次上限**: 100条（防止单次跑太久）
- **幂等保证**: 发送成功后写 `reminder_sent_at`

**通知接收者**（去重）:
1. 跟进人（`record.userId`）
2. 订单当前教务（`order.academicUserId`）
3. 销售（`order.salesUserId`）—— N-P1-07修复

**通知类型**: `ORDER_NODE_DUE`
- 标题: "订单节点到期"
- 内容: `订单 {orderId} 节点「{nodeType}」已到提醒时间：{content摘要}`

### 3.3 提前预警扫描器 (`runEarlyWarning`)
- **调度**: 与到期扫描同分钟执行
- **扫描窗口**: `next_remind_at` 在未来7天内
- **条件**: `enable_early_warning = true` 且 `early_warning_sent_at IS NULL`
- **通知类型**: `ORDER_NODE_EARLY_WARNING`
- 标题: "订单节点即将到期"
- 内容包含剩余天数

### 3.4 节点超时扫描器 (`scanOrderNodeTimeouts`)
- **调度**: 每30分钟执行（`CronExpression.EVERY_30_MINUTES`）
- **扫描对象**: 活跃状态订单（`in_progress`, `awaiting_client_info`, `client_info_completed`, `awaiting_teacher`, `teacher_assigned`, `to_deliver`）
- **超时判定**: 最后跟进记录超7天 或 无跟进记录且创建超7天
- **通知对象**: 所有 `admin`/`owner` 角色用户
- **通知类型**: `ORDER_NODE_OVERDUE`
- **内存缓存**: `recentlyNotified` Map，7天内不重复发
- **批量上限**: SCAN_BATCH = 200

### 3.5 待提醒列表 (`listPending`)
- 查询用户视角的待提醒列表
- 支持 `upcomingHours` 参数（默认7天，最大14天）
- 数据范围：自己跟进记录 + 自己名下订单
- 启用提前预警的记录看7天窗口，未启用的只看24小时

### 3.6 标记已处理 (`markHandled`)
- 将 `next_remind_at` 置为 `NULL`
- 权限校验：跟进人本人或订单当前教务

---

## 4. 通用提醒模块 (Reminders Module)

### 4.1 模块职责
跨角色消息通信系统，支持创建、回复、转发提醒消息。

### 4.2 Controller API 端点

| HTTP Method | Path | 说明 |
|-------------|------|------|
| POST | `/api/reminders` | 创建提醒 |
| GET | `/api/reminders/unread-count` | 未读提醒数 |
| PATCH | `/api/reminders/:id/read` | 标记已读 |
| POST | `/api/reminders/:id/reply` | 回复提醒 |
| POST | `/api/reminders/:id/forward` | 转发提醒 |

### 4.3 角色映射规则
```typescript
ROLE_TO_PORT_TYPE = {
  sales: 'sales',
  operation: 'operations',
  staff: 'operations',
  supervisor: 'operations',
  admin: 'operations',
  academic: 'academic',
  academic_supervisor: 'academic'
}
```

### 4.4 权限限制
- **创建提醒发送者角色白名单**: `sales`, `operation`, `staff`, `supervisor`, `admin`
- **academic 和 academic_supervisor 不能创建提醒**（但可接收）
- **接收者角色**: `sales`, `operation`, `supervisor`, `academic`

### 4.5 DTO 约束
- **提醒优先级**: `normal`, `urgent`
- **关联类型**: `lead`, `order`, `post`, `account`

---

## 5. 线索模块 (Leads Module)

### 5.1 模块职责
线索管理，支持教务通过线索查看关联订单。

### 5.2 Controller API 端点

| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/leads` | 查询线索列表 |
| GET | `/api/leads/:id` | 查看线索详情 |
| POST | `/api/leads/:id/follow` | 添加跟进记录 |
| GET | `/api/leads/:id/orders` | 查看线索关联订单 |

### 5.3 教务专属 Scope 过滤
`scope === 'academic-orders'` 时：
```sql
l.id IN (
  SELECT o.lead_id 
  FROM orders o 
  WHERE o.academic_user_id = :academicUserId 
  AND o.deleted_at IS NULL
)
```

---

## 6. 员工模块 (Employees Module)

### 6.1 模块职责
员工管理，包含教务角色的员工CRUD。

### 6.2 Controller API 端点

| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/employees` | 查询员工列表 |
| POST | `/api/employees` | 创建员工 |
| GET | `/api/employees/:id` | 查看员工详情 |
| PATCH | `/api/employees/:id` | 更新员工 |
| DELETE | `/api/employees/:id` | 删除员工 |
| POST | `/api/employees/:id/reset-password` | 重置密码 |

### 6.3 角色相关
- **登录角色白名单**: `operation`, `sales`, `academic`, `academic_supervisor`, `admin`, `supervisor`, `staff`, `owner`
- **创建员工时**: 同时创建关联的 `User` 账号
- **删除员工时**: 软删除员工并置关联用户为 `isActive = false`

---

## 7. 仪表盘模块 (Dashboard Module)

### 7.1 模块职责
数据看板与统计，支持个人看板和主管看板。

### 7.2 Controller API 端点

#### 个人看板
| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/dashboard/personal` | 个人综合数据 |
| GET | `/api/dashboard/personal/overview` | 个人概览 |
| GET | `/api/dashboard/personal/rankings` | 个人排名 |
| GET | `/api/dashboard/personal/today` | 今日数据 |

#### 主管看板
| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/dashboard/supervisor/overview` | 主管概览 |
| GET | `/api/dashboard/supervisor/analysis` | 数据分析 |
| GET | `/api/dashboard/supervisor/employee/:id/*` | 下属详情 |

### 7.3 缓存策略
- 使用内存缓存（`Map` + `cacheVersion`）
- 支持缓存失效：`invalidateAll()`, `invalidateRankings()`

---

## 8. 数据分析模块 (Analytics Module)

### 8.1 模块职责
数据快照与趋势分析。

### 8.2 Controller API 端点

| HTTP Method | Path | 说明 |
|-------------|------|------|
| GET | `/api/analytics/snapshots?days=N` | 每日数据快照 |

### 8.3 数据聚合
- 聚合 `posts` 和 `leads` 的每日数据
- 使用 `DATE_FORMAT` 按天分组
- 30秒内存缓存

---

## 9. 核心实体结构

### 9.1 Order Entity (`order.entity.ts`)
关键教务相关字段：
- `academicUserId`: 分配教务ID
- `academicOwner`: 教务负责人
- `academicRemark`: 教务内部备注
- `teacherId`, `teacherName`: 分配教师
- `backupTeachers`: 备用教师（JSON数组）
- `paperProgress`: 论文进度
- `currentStage`: 当前阶段
- `handoverStatus`: 交接状态
- `handoverTo`: 交接目标用户ID
- `handoverToTeacherAt`: 交接给教师时间

### 9.2 OrderFollowRecord Entity
关键提醒相关字段：
- `nextRemindAt`: 下次提醒时间
- `reminderSentAt`: 提醒已发时间
- `earlyWarningSentAt`: 预警已发时间
- `enableEarlyWarning`: 是否启用提前预警
- `nodeType`: 节点类型
- `content`: 跟进内容

---

## 10. 关键业务规则

### 10.1 数据可见性规则 (A-6)
| 角色 | 可见字段 | 隐藏字段 |
|------|----------|----------|
| academic/academic_supervisor | 基础信息、教师信息、进度 | 订单金额、合同金额、已付/未付/退款金额 |
| sales | 基础信息、金额 | 教师支付信息 |

### 10.2 订单状态枚举
```
pending_accept → to_receive → in_progress → awaiting_client_info → client_info_completed → awaiting_teacher → teacher_assigned → to_deliver → completed
异常状态: abnormal, closed
```

### 10.3 通知类型枚举
- `ORDER_NODE_DUE`: 节点到期提醒
- `ORDER_NODE_EARLY_WARNING`: 节点提前预警
- `ORDER_NODE_OVERDUE`: 节点超时告警
- `ORDER_UPDATED`: 订单更新（30秒去重窗口）

### 10.4 权限矩阵

| 功能 | academic | academic_supervisor |
|------|----------|---------------------|
| 创建订单 | ✅ | ✅ |
| 查看订单列表 | 自己的+pool | 自己的+pool |
| 查看金额 | ❌ | ❌ |
| 分配教师 | ✅ | ✅ |
| 节点提醒管理 | ✅ | ✅ |
| 交接订单 | ✅ | ✅ |
| 主管看板 | ❌ | ✅ |
| 团队管理 | ❌ | ✅ |

---

## 11. 定时任务汇总

| 任务名称 | Cron表达式 | 说明 |
|----------|-----------|------|
| orderNodeReminderScan | `*/1 * * * *` | 每分钟扫描到期提醒 |
| orderNodeTimeoutScan | `*/30 * * * *` | 每30分钟扫描超时订单 |

---

## 12. 文件清单

| 文件路径 | 说明 |
|----------|------|
| `backend/src/modules/orders/orders.controller.ts` | 订单控制器 |
| `backend/src/modules/orders/orders.service.ts` | 订单服务 |
| `backend/src/modules/orders/reminders.service.ts` | 节点提醒服务 |
| `backend/src/modules/reminders/reminders.controller.ts` | 通用提醒控制器 |
| `backend/src/modules/reminders/reminders.service.ts` | 通用提醒服务 |
| `backend/src/modules/leads/leads.controller.ts` | 线索控制器 |
| `backend/src/modules/leads/leads.service.ts` | 线索服务 |
| `backend/src/modules/employees/employees.controller.ts` | 员工控制器 |
| `backend/src/modules/employees/employees.service.ts` | 员工服务 |
| `backend/src/modules/dashboard/dashboard.controller.ts` | 仪表盘控制器 |
| `backend/src/modules/dashboard/dashboard.service.ts` | 仪表盘服务 |
| `backend/src/modules/analytics/analytics.controller.ts` | 数据分析控制器 |
| `backend/src/modules/analytics/analytics.service.ts` | 数据分析服务 |
| `backend/src/entities/order.entity.ts` | 订单实体 |
| `backend/src/entities/order-follow-record.entity.ts` | 订单跟进记录实体 |
