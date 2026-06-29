# XHSMedium 系统需求文档（汇总版）

> 版本: v1.3+
> 生成日期: 2026-06-29
> 基于代码分析自动生成

---

## 目录

1. [系统概述](#一系统概述)
2. [角色体系与权限矩阵](#二角色体系与权限矩阵)
3. [多端口架构](#三多端口架构)
4. [模块功能总览](#四模块功能总览)
5. [核心业务流程](#五核心业务流程)
6. [数据实体关系](#六数据实体关系)
7. [状态枚举汇总](#七状态枚举汇总)
8. [技术架构](#八技术架构)
9. [各角色需求文档索引](#九各角色需求文档索引)

---

## 一、系统概述

XHSMedium 是一款面向教育行业的客户资源管理与订单流转系统，支持从社交媒体（小红书、抖音）获取客资，经过销售跟进、成交、教务交付的完整业务流程。

### 1.1 业务定位
- **客资获取**: 通过小红书/抖音作品引流获取潜在客户
- **销售跟进**: 销售团队对客资进行跟进、成交
- **教务交付**: 教务团队负责订单的教学服务交付
- **数据分析**: 多维度数据看板与排行榜
- **财务管理**: 订单收支、成本利润核算

### 1.2 角色体系
系统支持五种角色：

| 角色 | 英文标识 | 主要职责 | 数据范围 |
|------|---------|---------|---------|
| **总后台** | owner | 系统所有者，最高权限 | 全部数据 |
| **运营端** | sales | 销售客资跟进、成交 | 分配给自己的客资 |
| **运营主管** | supervisor | 团队管理、作品评审 | 全团队数据 |
| **教务端** | academic | 订单交付、节点提醒 | 池单+自己的订单 |
| **教务主管** | admin | 系统管理、数据导出 | 全部数据 |

---

## 二、角色体系与权限矩阵

### 2.1 角色层级

```
owner（总后台）
  ├── admin（教务主管）
  ├── supervisor（运营主管）
  │     ├── staff / operation（运营人员）
  │     └── sales（销售人员）
  └── academic（教务）
        └── academic_supervisor（教务主管，同admin权限）
```

### 2.2 权限矩阵

| 功能模块 | owner | admin | supervisor | sales | operation | academic |
|----------|-------|-------|------------|-------|-----------|----------|
| 用户管理 | ✅ | ✅ | 查看 | ❌ | ❌ | ❌ |
| 员工作业管理 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 客资查看范围 | 全部 | 全部 | 全部 | 自己的 | 自己的 | 自己的 |
| 客资分配/重分配 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 订单查看范围 | 全部 | 全部 | 全部 | 自己的 | ❌ | 池单+自己的 |
| 订单删除 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 财务系统 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 交接管理 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 仪表盘-个人 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 仪表盘-主管 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 排行榜 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 操作日志 | 全部 | 全部 | 自己的 | 自己的 | 自己的 | 自己的 |
| 导入数据 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| 导出数据 | 全部 | 全部 | 全部 | 受限 | ❌ | ❌ |
| 数据分析 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 三、多端口架构

### 3.1 端口体系 (v1.3)

| 端口 | 环境变量 | 允许角色 | 拒绝角色 | 说明 |
|------|---------|---------|---------|------|
| **3000** | PORT | sales/academic/staff/admin/supervisor | owner | 主入口 |
| **3001** | OWNER_PORT | owner | 其他 | 总后台专属 |
| **3003** | ALL_ROLES_PORT | sales/academic/staff/admin/supervisor | owner (L2拒绝) | 统一登录入口 |
| **8089** | — | — | — | NestJS 业务 API |
| **3302** | — | — | — | Next.js 新前端 (dev) |

### 3.2 三层鉴权

| 层级 | 位置 | 职责 |
|------|------|------|
| **L1** | server.js Express 中间件 | O(1) JWT peek，快速拒绝 |
| **L2** | auth.service.ts:login | 登录时端口-角色匹配校验 |
| **L3** | auth.guard.ts | 所有 `/api/*` 请求 JWT + 端口校验 |

### 3.3 端口隔离规则
- **owner 强制 3001**: 即使在 3003 也会被 L2 拒绝
- **admin/supervisor 走 3003**: 统一登录入口
- **其他角色走 3000**: 主入口

---

## 四、模块功能总览

### 4.1 核心模块（所有角色共享）

| 模块 | 功能 | 涉及角色 |
|------|------|---------|
| **Auth** | 登录/登出/JWT签发/密码校验 | 全部 |
| **Users** | 用户账号CRUD、密码管理、状态变更 | admin/owner |
| **Employees** | 员工资料、关联登录账号、软删除 | admin/owner/supervisor |
| **Leads** | 客资录入、状态流转、跟进记录、协同、改派、导出 | 全部（范围隔离） |
| **Orders** | 订单创建、交接、教务分配、节点提醒、成交状态 | 全部（范围隔离） |
| **Posts** | 作品CRUD、来源识别、质量状态 | 全部（范围隔离） |
| **Accounts** | 社交账号管理（小红书/抖音） | 全部（范围隔离） |
| **Dashboard** | 总览仪表盘、个人/主管看板 | 全部（范围隔离） |
| **Rankings** | 运营排行榜（作品/客资/流量/学习） | 全部（范围隔离） |
| **Analytics** | 数据快照、趋势分析 | 全部 |
| **Notifications** | 站内消息、WebSocket实时推送 | 全部（portType隔离） |
| **Reminders** | 提醒创建、回复、转发 | 全部（角色限制） |
| **Exports** | 异步导出任务（CSV/Excel） | 全部（类型限制） |
| **Imports** | 数据导入（客资批量导入） | admin/owner/supervisor |
| **Operation-Logs** | 操作日志审计 | 全部（admin/owner看全部） |
| **Favorites** | 收藏夹（作品收藏） | 全部 |
| **Collaboration-Tasks** | 销售-运营协同任务 | 全部 |
| **Uploads** | 文件上传（头像/引流截图） | 全部 |
| **Scraping** | Playwright爬虫调度（小红书/抖音） | 全部 |
| **Parser/Leads-Parser** | 链接解析、客资文本解析 | 全部 |
| **Lead-Drafts** | 客资草稿暂存 | 全部 |

### 4.2 角色专属模块

| 模块 | 专属角色 | 功能 |
|------|---------|------|
| **Sales** | sales | 销售看板首页、今日待添加/跟进、成交列表 |
| **Supervisor-Suggestions** | supervisor/admin/owner | 主管作品评审建议 |
| **Reminders (节点)** | academic | 订单节点提醒、预警、超时扫描 |
| **Finance** | owner/admin | 财务系统（收入/支出/利润） |

---

## 五、核心业务流程

### 5.1 客资生命周期

```
[获客] → [分配] → [跟进] → [成交] → [交付] → [完成]
  ↑        ↑        ↑        ↑        ↑
  |        |        |        |        |
Posts   Leads   Follow    Close   Handover
  →    Records   Deal    → Accept/Reject
 scraping         ↓
              Orders
```

### 5.2 订单状态机

```
pending_accept（待接单）
    ↓
to_receive（待接收）
    ↓
in_progress（进行中）
    ↓
awaiting_client_info（等待客户资料）
    ↓
client_info_completed（客户资料已完成）
    ↓
awaiting_teacher（等待分配教师）
    ↓
teacher_assigned（教师已分配）
    ↓
to_deliver（待交付）
    ↓
completed（已完成）

异常分支:
    → abnormal（异常）
    → closed（已关闭）
```

### 5.3 交接状态机

```
pending（待交接）
    ↓
handed_over（已交接）
    ↓
accepted（已接受） ←→ rejected（已拒绝）
```

### 5.4 成交状态机

```
not_deal（未成交）
    ↓
deal_pending（待成交）
    ↓
deal_done（已成交）
    ↓
refunded（已退款）/ invalid（无效）
```

### 5.5 客资成交流程

```
1. 销售在 Leads 模块跟进客资
2. 客资状态达到可成交条件
3. 调用 POST /leads/:id/close-deal
   - 开启数据库事务
   - 创建 Order 记录
   - 创建 OrderFinance 记录
   - 创建 OrderFollowRecord 记录
   - 更新 Lead 状态为 deal_done
   - 提交事务
4. 订单进入 pending_accept 状态
5. 教务端接收订单（或系统自动分配）
6. 订单状态流转至 in_progress
7. 完成服务后状态更新至 completed
```

### 5.6 订单交接流程

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

### 5.7 节点提醒流程

```
1. 创建跟进记录时设置 nextRemindAt
2. 每分钟 cron 扫描到期提醒
3. 发送通知给：跟进人 + 当前教务 + 销售
4. 提前7天预警扫描
5. 每30分钟扫描超时订单（超7天未跟进）
6. 通知 admin/owner 角色用户
```

---

## 六、数据实体关系

### 6.1 实体关系图

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

Post (作品)
  ├── Account (关联账号) [N:1]
  ├── Lead (关联客资) [1:N]
  └── PostMetrics (作品指标) [1:N]

Account (账号)
  ├── Employee (所属员工) [N:1]
  └── Post (关联作品) [1:N]
```

### 6.2 核心实体字段

#### User
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | string | 用户名 |
| password | string | bcrypt 哈希 |
| role | enum | 角色（见角色体系） |
| status | enum | active/inactive/locked |
| capacityPaused | boolean | 销售容量暂停 |

#### Lead
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| employeeId | string | 所属运营 |
| accountId | string | 来源账号 |
| postId | string | 来源作品 |
| contactInfo | string | 联系方式 |
| nickname | string | 客户昵称 |
| status | enum | 客资状态 |
| processStatus | enum | 处理状态 |
| addStatus | enum | 添加状态 |
| dealStatus | enum | 成交状态 |
| intentionLevel | enum | 意向等级 |
| assignedSalesUserId | string | 分配的销售 |
| nextFollowTime | Date | 下次跟进时间 |
| isDispatched | boolean | 是否已分流 |

#### Order
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| leadId | string | 关联客资 |
| salesUserId | string | 销售用户 |
| academicUserId | string | 教务用户 |
| orderCode | string | 订单编号 |
| amount | number | 成交金额 |
| paidStatus | enum | 付款状态 |
| orderStatus | enum | 订单状态 |
| handoverStatus | enum | 交接状态 |
| paymentStageDetail | json | 分期明细 |

---

## 七、状态枚举汇总

### 7.1 用户状态
- `active` - 正常
- `inactive` - 禁用
- `locked` - 锁定

### 7.2 员工作业状态
- `在职` - 正常在职
- `离职` - 已离职
- `停用` - 账号停用

### 7.3 客资状态
| 状态 | 说明 |
|------|------|
| new | 新客资 |
| assigned | 已分配 |
| in_followup | 跟进中 |
| in_collaboration | 协作中 |
| operation_handled | 运营已处理 |
| added_success | 已添加成功 |
| deal_done | 已成交 |
| invalid | 无效 |

### 7.4 处理状态
- `not_contacted` - 未联系
- `waiting_pass` - 等待通过
- `communicating` - 沟通中
- `quoted` - 已报价
- `deal_pending` - 待成交
- `deal_done` - 已成交
- `invalid` - 无效

### 7.5 添加状态
- `not_added` - 未添加
- `applied` - 已申请
- `not_passed` - 未通过
- `operation_reminded` - 运营已提醒
- `added` - 已添加

### 7.6 成交状态
- `not_deal` - 未成交
- `deal_pending` - 待成交
- `deal_done` - 已成交
- `refunded` - 已退款
- `invalid` - 无效

### 7.7 意向等级
- `high` - 高
- `mid` - 中
- `low` - 低
- `invalid` - 无效
- `pending` - 待定

### 7.8 订单状态
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

### 7.9 交接状态
- `pending` - 待交接
- `handed_over` - 已交接
- `accepted` - 已接受
- `rejected` - 已拒绝

### 7.10 付款状态
- `unpaid` - 未付款
- `partial` - 部分付款
- `paid` - 已付款

### 7.11 平台枚举
- `xiaohongshu` / `xhs` / `小红书` - 小红书
- `douyin` / `抖音` - 抖音

### 7.12 时间周期枚举
- `today` - 今日
- `week` / `thisweek` - 本周
- `month` / `thismonth` - 本月
- `thisyear` / `1y` - 本年/近1年
- `7d` / `14d` / `30d` / `90d` - 近N天
- `3y` - 近3年
- `total` / `all` / `累计` - 累计

---

## 八、技术架构

### 8.1 技术栈
- **框架**: NestJS (Node.js)
- **ORM**: TypeORM
- **数据库**: MySQL (utf8mb4)
- **缓存**: 内存缓存（Dashboard 5分钟，Analytics 30秒）
- **异步任务**: BullMQ + Redis (fallback 到 setImmediate)
- **WebSocket**: 通知实时推送
- **前端**: Next.js (dev 端口 3302)

### 8.2 架构特点

#### 分页标准
```typescript
interface PagedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

#### 统一响应格式
```typescript
interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
}
```

### 8.3 缓存策略
- **Dashboard**: 5分钟TTL内存缓存，支持手动失效
- **Analytics**: 30秒缓存
- **排行榜**: 无缓存（实时查询）

### 8.4 定时任务

| 任务名称 | Cron表达式 | 说明 |
|----------|-----------|------|
| orderNodeReminderScan | `*/1 * * * *` | 每分钟扫描到期提醒 |
| orderNodeTimeoutScan | `*/30 * * * *` | 每30分钟扫描超时订单 |
| collaborationTaskTimeout | `*/30 * * * *` | 每30分钟检查协同任务超时 |

### 8.5 关键业务规则

1. **数据范围隔离**: 所有列表查询都需经过 scope 过滤
2. **乐观锁**: 客资看板式更新使用 `expectedUpdatedAt`
3. **事务一致性**: 成交操作在事务内创建订单+财务记录+跟进记录
4. **去重规则**: 导入时30天内按 `contact_info` 精确匹配去重
5. **联系方式清洗**: 自动去除 `+86`, `vx`, `微信:` 等前缀
6. **数据脱敏**: 非 admin/owner 角色导出时联系方式脱敏

---

## 九、各角色需求文档索引

| 角色 | 文档路径 | 说明 |
|------|---------|------|
| 总后台 | `doc/requirements/owner-requirements.md` | Owner 角色专属需求 |
| 运营端 | `doc/requirements/sales-requirements.md` | Sales 角色专属需求 |
| 运营主管 | `doc/requirements/supervisor-requirements.md` | Supervisor 角色专属需求 |
| 教务端 | `doc/requirements/academic-requirements.md` | Academic 角色专属需求 |
| 教务主管 | `doc/requirements/admin-requirements.md` | Admin 角色专属需求 |

---

*文档生成时间: 2026-06-29*
*适用版本: v1.3+*
*系统名称: XHSMedium*
