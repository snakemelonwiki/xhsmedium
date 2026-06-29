# 运营端 (Sales) 角色需求文档

> 基于代码分析生成 | 适用版本: v1.3+ | 生成日期: 2026-06-29

## 一、角色定义

- **角色字段**: `'sales'`
- **数据范围**: 仅可见分配给自己的客资和订单（`assignedSalesUserId = 自己`）
- **端口访问**: PORT (3000) 主入口

## 二、模块概览

运营端涉及 14 个后端模块：

| 模块 | 路径 | 核心度 | 说明 |
|------|------|--------|------|
| sales | `modules/sales/` | 核心 | 销售看板首页 |
| leads | `modules/leads/` | 核心 | 客资管理 |
| orders | `modules/orders/` | 核心 | 订单管理 |
| accounts | `modules/accounts/` | 支持 | 账号管理（间接） |
| posts | `modules/posts/` | 支持 | 作品管理 |
| favorites | `modules/favorites/` | 支持 | 我的收藏 |
| collaboration-tasks | `modules/collaboration-tasks/` | 支持 | 协同任务 |
| reminders | `modules/reminders/` | 支持 | 提醒/通知 |
| imports | `modules/imports/` | 支持 | 客资导入 |
| exports | `modules/exports/` | 支持 | 数据导出 |
| lead-drafts | `modules/lead-drafts/` | 支持 | 客资草稿 |
| leads-parser | `modules/leads-parser/` | 支持 | 客资文本解析 |
| parser | `modules/parser/` | 支持 | 链接解析 |
| uploads | `modules/uploads/` | 通用 | 文件上传 |

---

## 三、核心模块详细需求

### 3.1 Sales 模块（销售看板首页）

**文件**: `modules/sales/sales.controller.ts` + `sales.service.ts`

**权限**: 仅 `role === 'sales'` 可访问，否则返回 403。

#### API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/sales/home-summary` | 销售首页六宫格统计 |
| GET | `/api/sales/leads/today-not-added` | 今日待添加客资列表 |
| GET | `/api/sales/followups/today` | 今日待跟进客资列表 |
| GET | `/api/sales/deals` | 我的成交列表（分页） |
| POST | `/api/sales/deals/close` | 手动标记成交 |

#### home-summary 统计指标
- `newAssigned`: 新分配客资数
- `pendingAdd`: 待添加客资数
- `notPassed`: 未通过客资数
- `todayPending`: 今日待跟进客资数
- `orderPending`: 待成交订单数
- `dealDone`: 已成交数
- 排除 `deal_status IN ('deal_done', 'refunded')` 的客资

---

### 3.2 Leads 模块（客资管理）

**文件**: `modules/leads/leads.controller.ts` + `leads.service.ts`

#### 数据范围隔离
- `canAccessLead`: sales 只能访问 `assignedSalesUserId === actorUserId` 的客资
- `reassignLead`: 仅 supervisor/admin/owner 或 self 可重新分配

#### 客资生命周期状态

| 状态字段 | 有效值 | 说明 |
|---------|--------|------|
| status | `new`, `contact_added`, `follow_up`, `deal_closed`, `closed` | 客资状态 |
| processStatus | `not_contacted`, `applied`, `pending`, `chatting`, `follow_up`, `closed` | 处理状态 |
| addStatus | `not_added`, `added`, `rejected`, `pending` | 添加状态 |
| dealStatus | `not_deal`, `deal_pending`, `deal_done`, `refunded`, `invalid` | 成交状态 |
| intentionLevel | `high`, `mid`, `low`, `invalid`, `pending` | 意向等级 |

#### API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/leads` | 列表（分页 + 筛选） |
| GET | `/api/leads/stats` | 统计概览 |
| GET | `/api/leads/aggregate-by-post` | 按作品聚合客资 |
| GET | `/api/leads/tomorrow-followups` | 明日待跟进 |
| GET | `/api/leads/import-template.xlsx` | 下载导入模板 |
| GET | `/api/leads/:id` | 详情 |
| POST | `/api/leads` | 创建 |
| PATCH | `/api/leads/:id` | 更新 |
| DELETE | `/api/leads/:id` | 删除 |
| GET | `/api/leads/:id/follow-records` | 跟进记录列表 |
| POST | `/api/leads/:id/follow-records` | 写跟进 |
| POST | `/api/leads/:id/follow-ups` | 设置下次跟进时间 |
| PATCH | `/api/leads/:id/deal-status` | 更新成交状态 |
| PATCH | `/api/leads/:id/intention-level` | 更新意向等级 |
| POST | `/api/leads/:id/collaboration` | 发起协同任务 |
| POST | `/api/leads/:id/source-confirm` | 来源确认 |
| POST | `/api/leads/:id/reassign` | 重新分配销售 |

#### 关键业务规则
- `autoAssignSales`: 轮询分配算法（round-robin）
- `findFilteredPaged`: 使用 SQL Window Function `COUNT(*) OVER()` 做分页
- `updateBoard`: 乐观锁 (`expectedUpdatedAt`) + 状态机转换校验
- `updateDealStatus`: 校验有效 code 集合
- `updateIntentionLevel`: 校验有效 level 集合
- `normalizeContact`: 清洗联系方式前缀（`+86`, `vx`, `微信:` 等）
- 30 天内按 `contact_info` 去重

---

### 3.3 Orders 模块（订单管理）

**文件**: `modules/orders/orders.controller.ts` + `orders.service.ts`

#### 数据范围隔离
- `canAccessOrder`: sales 只能看自己的订单；academic 看池单 + 自己的
- `listMyDeals`: 仅过滤 `sales_user_id`

#### 订单状态机
```
pending → handed_over → accepted | rejected
```

#### 订单状态枚举
```
pending_accept, to_receive, in_progress, awaiting_client_info,
client_info_completed, awaiting_teacher, teacher_assigned,
to_deliver, completed, abnormal, closed
```

#### 付款状态推导
- `unpaid` → `partial` → `paid`（基于 `paymentStageDetail` JSON 自动计算）

#### API 端点

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/leads/:id/close-deal` | 成交并创建订单 |
| GET | `/api/orders` | 列表（分页 + 筛选） |
| GET | `/api/orders/:id` | 详情 |
| GET | `/api/orders/:id/delivery` | 交付详情 |
| PATCH | `/api/orders/:id` | 更新订单 |
| GET | `/api/orders/:id/follow-records` | 跟进记录 |
| POST | `/api/orders/:id/follow-records` | 写跟进 |
| POST | `/api/orders/:id/handover/accept` | 教务接单 |
| POST | `/api/orders/:id/handover/reject` | 教务拒收 |
| GET | `/api/orders/:id/handover/status` | 交接状态 |
| POST | `/api/orders/:id/abnormal-feedback` | 异常反馈 |
| GET | `/api/orders/:id/abnormal-feedback` | 异常反馈列表 |
| PATCH | `/api/orders/:id/abnormal-feedback` | 更新异常反馈 |
| POST | `/api/orders/:id/payments` | 添加付款记录 |

#### 关键业务规则
- `closeDeal`: 事务性创建 `orders` + `order_finance` + `order_follow_records`
- `addPayment`: 更新 `paymentStageDetail` JSON，重新计算 `clientPaid` 和 `paidStatus`
- 订单编号生成规则：`ORD-YYYYMMDD-XXXXX`，每日从 `00001` 重置，使用行锁保证并发安全

---

### 3.4 Accounts 模块（账号管理）

**文件**: `modules/accounts/accounts.controller.ts` + `accounts.service.ts`

**数据范围**: staff/operation 角色限制为 `employeeId` 范围；sales 角色通常不直接访问，但通过 `leads`/`posts` 间接关联。

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/accounts` | 列表（分页） |
| POST | `/api/accounts` | 创建 |
| PATCH | `/api/accounts/:id` | 更新 |
| PUT | `/api/accounts/:id` | 全量更新 |
| DELETE | `/api/accounts/:id` | 删除 |

---

### 3.5 Posts 模块（作品管理）

**文件**: `modules/posts/posts.controller.ts` + `posts.service.ts`

**数据范围**: 普通运营只能看自己 `employeeId` 的作品；admin/owner/supervisor 看全部。

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/posts` | 列表（分页 + 指标筛选） |
| POST | `/api/posts` | 创建 |
| POST | `/api/posts/parse-link` | 解析链接自动填充 |
| POST | `/api/posts/recommend` | 推荐作品 |
| GET | `/api/posts/plaza` | 作品广场 |
| GET | `/api/posts/learning-board` | 学习榜单 |
| GET | `/api/posts/supervisor-picks` | 主管推荐 |
| POST | `/api/posts/:id/refresh-metrics` | 刷新指标 |

**业务规则**:
- `findPaged`: 支持 `leadsCount`, `traffic` 等子查询筛选
- `getLearningBoard`: 综合评分算法（基于 traffic 和 leads）
- `findSensitiveInfo`: 仅 `supervisor`/`admin`/`owner` 可看关联客资/订单数据

---

### 3.6 Favorites 模块（我的收藏）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/favorites/mine` | 我的收藏列表 |
| POST | `/api/favorites/toggle` | 切换收藏状态 |
| POST | `/api/favorites/sync` | 同步收藏状态 |

---

### 3.7 Collaboration-Tasks 模块（协同任务）

**协同类型**:
```
remind_customer(催客户), supplement_info(补充信息),
verify_identity(验证身份), second_touch(二次触达)
```

**任务生命周期**:
```
pending → handling → handled | timeout | closed
```

**超时检测**: 每 30 分钟 cron 检查超时任务。

---

### 3.8 Reminders 模块（提醒）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/reminders` | 创建提醒 |
| GET | `/api/reminders/unread-count` | 未读数量 |
| PATCH | `/api/reminders/:id/read` | 标记已读 |
| POST | `/api/reminders/:id/reply` | 回复提醒 |
| POST | `/api/reminders/:id/forward` | 转发提醒 |

---

### 3.9 Imports 模块（导入）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/imports` | 创建导入任务 |
| GET | `/api/imports` | 导入任务列表 |
| GET | `/api/imports/:id` | 导入任务详情 |

**业务规则**:
- 异步导入：优先使用 BullMQ，Redis 不可用时降级到 `setImmediate`
- 30 天内按 `contact_info` 去重检测
- `normalizeContact`: 清洗联系方式前缀
- 支持 Excel 导入客资

---

### 3.10 Exports 模块（导出）

**销售可导出类型**: `leads`, `orders`, `order_progress`, `collaboration_records`

**权限控制**:
- 销售只能导出 `scope=mine`（自己的数据）
- admin/owner/supervisor 可导出 `scope=all`

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/exports` | 创建导出任务 |
| GET | `/api/exports` | 导出任务列表 |
| GET | `/api/exports/:id` | 导出任务详情 |
| GET | `/api/exports/:id/download` | 下载文件 |

**业务规则**:
- 1 分钟防抖：同用户同类型 60 秒内不重复创建
- 异步生成：BullMQ 或 `setImmediate` 兜底
- 联系方式脱敏：非 admin/owner 保留前 3 后 4，中间打 `***`

---

### 3.11 Lead-Drafts 模块（客资草稿）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lead-drafts` | 草稿列表 |
| PUT | `/api/lead-drafts/:id` | 保存草稿 |
| DELETE | `/api/lead-drafts/:id` | 删除草稿 |

**业务规则**:
- 同用户同类型最多保留 10 条
- `contentJson` 敏感字段加密存储（C4-013）

---

### 3.12 Leads-Parser 模块（客资文本解析）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/leads/parse` | 解析原始文本提取客资字段 |

**解析字段**: platform, accountKeyword, nickname, contact, contactType, ip, sourcePostKeyword, operatorKeyword, status, remark

**联系方式检测优先级**: phone > wxid_ > wechat-label > douyin-label > xhs-label

---

### 3.13 Parser 模块（通用链接解析）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/parser/parse` | 解析帖子链接 |
| POST | `/api/parser/open-login` | 启动登录浏览器 |
| POST | `/api/parser/close-login` | 关闭登录浏览器 |
| POST | `/api/parser/parse-image` | 图片 OCR（placeholder） |
| GET | `/api/parser/login-status` | 查询登录态 |

**支持平台**: 小红书, 抖音

---

### 3.14 Uploads 模块（文件上传）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/uploads` | 上传文件 |
| GET | `/api/uploads/config` | 上传配置 |
| GET | `/api/uploads/view/:bucket/:key` | 查看文件 |

**支持类型**: image/jpeg, image/png, image/webp, image/gif, Word, Excel, PDF
**大小限制**: 10MB

---

## 四、数据实体结构

### 4.1 Lead（客资）

**文件**: `entities/lead.entity.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| employeeId | string | 所属运营 |
| accountId | string | 来源账号 |
| postId | string | 来源作品 |
| platform | string | 平台 |
| contactInfo | string | 联系方式 |
| nickname | string | 客户昵称 |
| status | string | 客资状态 |
| processStatus | string | 处理状态 |
| addStatus | string | 添加状态 |
| dealStatus | string | 成交状态 |
| intentionLevel | string | 意向等级 |
| assignedSalesUserId | string | 分配的销售 ID |
| assignedSalesUserName | string | 分配的销售姓名 |
| nextFollowTime | Date | 下次跟进时间 |
| isDispatched | boolean | 是否已分流 |
| clientDegree | string | 客户学历 |
| clientMajorResearch | string | 客户专业/研究方向 |
| clientTimeRequirement | string | 客户时间要求 |
| objectionPoint | string | 异议点 |
| followAction | string | 跟进措施 |
| followActionAt | Date | 跟进时间 |

### 4.2 Order（订单）

**文件**: `entities/order.entity.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| leadId | string | 关联客资 |
| salesUserId | string | 销售用户 ID |
| academicUserId | string | 教务用户 ID |
| serviceType | string | 产品类型 |
| amount | number | 成交金额 |
| paidStatus | string | 付款状态 |
| orderStatus | string | 订单状态 |
| handoverStatus | string | 交接状态 |
| orderCode | string | 订单编号 |
| productType | string | 产品类型 |
| paymentStage | string | 付款阶段 |
| paymentPlan | string | 分期方案 |
| paymentStageDetail | json | 分期明细 JSON |

### 4.3 Post（作品）

**文件**: `entities/post.entity.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| employeeId | string | 所属运营 |
| accountId | string | 关联账号 |
| platform | string | 平台 |
| title | string | 标题 |
| postType | string | 作品类型 |
| traffic | number | 流量 |
| likes, comments, favorites, shares | number | 互动指标 |
| publishedAt | Date | 发布日期 |
| isSupervisorPicked | boolean | 是否主管推荐 |
| supervisorPickedBy | string | 标记人 |
| supervisorPickedAt | Date | 标记时间 |

### 4.4 Account（账号）

**文件**: `entities/account.entity.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| employeeId | string | 所属运营 |
| platform | string | 平台 |
| accountName | string | 账号名称 |
| accountUid | string | 平台 UID |
| profileUrl | string | 主页链接 |
| persona | string | 人设 |
| positioning | string | 定位 |
| postingPlan | string | 发布计划 |
| status | string | 状态 |

---

## 五、业务规则汇总

### 5.1 数据范围隔离规则

| 角色 | 客资范围 | 订单范围 | 作品范围 |
|------|---------|---------|---------|
| sales | `assignedSalesUserId = 自己` | `sales_user_id = 自己` | 间接 |
| admin/owner/supervisor | 全部 | 全部 | 全部 |
| staff/operation | `employeeId` | — | `employeeId = 自己` |
| academic | — | 池单 + 自己认领 | — |

### 5.2 分页标准

统一返回格式:
```typescript
{
  items: T[],
  total: number,
  limit: number,
  offset: number
}
```

### 5.3 成交状态机

```
not_deal → deal_pending → deal_done
                    ↓
                 refunded
```

### 5.4 意向等级

```
high(高意向), mid(中意向), low(低意向), invalid(无效), pending(待评估)
```

### 5.5 付款状态推导

基于 `paymentStageDetail.stages[].paidAt` 自动计算:
- 无任何 `paidAt` → `unpaid`
- 部分有 `paidAt` → `partial`
- 全部有 `paidAt` → `paid`

### 5.6 联系方式清洗规则

自动去除前缀: `+86`, `vx`, `微信:`, `V:`, `电话:`, `手机:` 等

### 5.7 去重规则

导入时 30 天内按 `contact_info` 精确匹配去重

---

## 六、权限矩阵

| 功能 | sales | staff | operation | supervisor | admin | owner | academic |
|------|-------|-------|-----------|------------|-------|-------|----------|
| 销售看板首页 | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 我的客资 | ✓ | ✗ | ✗ | ✓(全部) | ✓ | ✓ | ✗ |
| 客资跟进 | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| 成交订单 | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| 订单跟进 | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓(自己的+池单) |
| 导出客资 | ✓(自己的) | ✓ | ✓ | ✓(全部) | ✓ | ✓ | ✗ |
| 导出订单 | ✓(自己的) | ✗ | ✗ | ✓(全部) | ✓ | ✓ | ✓ |
| 作品查看 | — | ✓(自己的) | ✓(自己的) | ✓(全部) | ✓ | ✓ | — |
| 协同任务 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 账号管理 | — | ✓(自己的) | ✓(自己的) | ✓ | ✓ | ✓ | — |

---

## 七、技术实现要点

1. **ORM**: TypeORM with QueryBuilder for complex SQL
2. **Pagination**: Window function `COUNT(*) OVER()` for accurate totals
3. **Async Processing**: BullMQ with Redis, fallback to `setImmediate`
4. **Optimistic Locking**: `expectedUpdatedAt` for concurrent board updates
5. **Data Masking**: Contact info masking for non-admin roles
6. **Logging**: Operation logs for all mutations
7. **Notifications**: Integrated notification system for reminders
8. **Import/Export**: Async task pattern with status tracking
