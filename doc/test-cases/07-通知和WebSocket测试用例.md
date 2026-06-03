# 通知和 WebSocket 测试用例

> 文档版本：v1.2
> 创建日期：2026-06-03
> 依据文档：`doc/v1.2-完整交付版-AB端任务分配.md` §5.2 通知系统
> 适用范围：运营端、销售端、教务端、主管端

---

## 一、文档概述

### 1.1 测试范围

本文档覆盖运营中台四端口的通知和 WebSocket 实时推送系统的完整测试，包含：
- 12 种通知类型的创建、入库、推送、已读、跳转、离线补看
- 10 种 WebSocket 事件的触发、接收、映射关系
- 通知基础功能（未读数、标记已读、筛选）
- 消息中心功能（红点、Badge、列表、跳转）
- 实时推送（3 秒内推送、60 秒兜底轮询）
- 协同超时扫描器（@Cron 30 分钟）
- 异常场景（断线重连、多端登录、跨用户隔离）

### 1.2 术语说明

| 术语 | 说明 |
|------|------|
| 通知入库 | 通知创建后必须写入 `notifications` 表 |
| 离线补看 | 用户离线期间的通知，上线后可查看 |
| 实时推送 | Socket.IO 建立的 WebSocket 连接，在线用户 < 3 秒收到 |
| 兜底轮询 | WebSocket 不可用时的 HTTP 轮询，间隔 60 秒 |
| typeCode | 通知类型代码，如 `lead_assigned`、`order_created` |
| routeHint | 通知点击后的跳转路径 |

### 1.3 测试环境要求

- 后端服务运行中，端口 3000/3001
- MySQL 数据库可访问
- Socket.IO 服务正常（`/notifications` namespace）
- 测试用户：operation_001（运营）、sales_001（销售）、academic_001（教务）、supervisor_001（主管）

---

## 二、通知类型矩阵表

| 编号 | typeCode | 中文名称 | 触发场景 | 接收端 | 关联 WebSocket 事件 |
|------|----------|----------|----------|--------|---------------------|
| N-01 | `lead_assigned` | 新客资分配 | 运营分配客资给销售 | 销售 | `lead.assigned` |
| N-02 | `collaboration_requested` | 协同申请 | 销售发起协同任务 | 运营 | `collaboration.requested` |
| N-03 | `customer_not_passed` | 客户未通过 | 销售标记客户未通过 | 运营 | `lead.customer_not_passed` |
| N-04 | `collaboration_handled` | 协同已处理 | 运营处理协同任务 | 销售 | `collaboration.handled` |
| N-05 | `customer_added` | 客户已添加 | 销售标记客户已添加通过 | 运营 | `lead.added_success` |
| N-06 | `lead_deal_done` | 成交提醒 | 销售标记成交 | 主管 | **已下线** |
| N-07 | `order_created` | 新订单成交 | 销售成交创建订单 | 教务、主管 | `order.created` |
| N-08 | `order_updated` | 订单进度更新 | 教务更新订单进度 | 销售、主管 | `order.updated` |
| N-09 | `order_abnormal` | 订单异常 | 教务/销售提交订单异常 | 销售、主管 | `order.abnormal` |
| N-10 | `export_finished` | 导出完成 | 导出任务完成 | 用户 | `export.finished` |
| N-11 | `supervisor_suggestion` | 主管建议 | 主管添加建议 | 运营 | **已下线** |
| N-12 | `collaboration_timeout` | 协同超时 | @Cron 扫描超时任务 | 运营、主管 | 无独立业务事件 |

---

## 三、WebSocket 事件矩阵表

| 编号 | 事件名称 | 触发条件 | 接收端 | 事件内容 | 前端订阅方式 |
|------|----------|----------|--------|----------|-------------|
| W-01 | `notification.created` | 任意通知创建 | 接收者 | 完整通知对象 | `socket.on('notification.created')` |
| W-02 | `notification:new` | 任意通知创建（兼容旧版） | 接收者 | 完整通知对象 | `socket.on('notification:new')` |
| W-03 | `lead.assigned` | `typeCode=lead_assigned` | 销售 | 通知对象 | `socket.on('lead.assigned')` |
| W-04 | `collaboration.requested` | `typeCode=collaboration_requested` | 运营 | 通知对象 | `socket.on('collaboration.requested')` |
| W-05 | `lead.customer_not_passed` | `typeCode=customer_not_passed` | 运营 | 通知对象 | `socket.on('lead.customer_not_passed')` |
| W-06 | `collaboration.handled` | `typeCode=collaboration_handled` | 销售 | 通知对象 | `socket.on('collaboration.handled')` |
| W-07 | `lead.added_success` | `typeCode=customer_added` | 运营 | 通知对象 | `socket.on('lead.added_success')` |
| W-08 | `order.created` | `typeCode=order_created` | 教务、主管 | 通知对象 | `socket.on('order.created')` |
| W-09 | `order.updated` | `typeCode=order_updated` | 销售、主管 | 通知对象 | `socket.on('order.updated')` |
| W-10 | `order.abnormal` | `typeCode=order_abnormal` | 销售、主管 | 通知对象 | `socket.on('order.abnormal')` |
| W-11 | `export.finished` | `typeCode=export_done` | 用户 | 通知对象 | `socket.on('export.finished')` |
| W-12 | `notification.connected` | Socket 连接成功 | 客户端 | `{ok: true, userId}` | `socket.on('notification.connected')` |
| W-13 | `notification:error` | Socket 认证失败 | 客户端 | `{message: string}` | `socket.on('notification:error')` |

---

## 四、通知基础功能测试用例

### 4.1 通知创建与入库

#### TC-NOT-001：运营分配客资，销售收到新客资分配通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_assigned` |
| 触发场景 | 运营在客资录入页面选择销售并提交 |
| 接收端 | 被分配的sales_001 |
| 优先级 | **P0** |

**前置条件：**
1. 运营账号 operation_001 已登录
2. 销售账号 sales_001 已存在
3. WebSocket 服务正常运行

**测试步骤：**

1. 运营（operation_001）登录运营端
2. 进入客资录入页面
3. 填写客资信息，选择销售 `sales_001`
4. 点击提交按钮
5. 记录提交时间 T1
6. 监控销售（sales_001）的 WebSocket 连接

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增一条记录，type_code='lead_assigned'，receiver_id=sales_001.id | SQL 查询 |
| WebSocket 推送 | sales_001 在 T1 + 3 秒内收到 `lead.assigned` 事件 | 网络抓包/控制台日志 |
| 事件内容 | payload 包含 id、typeCode='lead_assigned'、title、relatedId（客资ID）、routeHint | WebSocket 消息解析 |
| 未读数接口 | `GET /api/notifications/unread-count` 返回值 +1 | API 响应断言 |
| 消息中心 | 销售端消息列表显示新通知，unread=true | UI 截图 |

**实际结果：** （留空，测试后填写）

**备注：**
- 验证 `relatedType='lead'`，`relatedId` 为客资 ID
- 验证 `routeHint` 格式为 `/sales/leads/{leadId}`

---

#### TC-NOT-002：销售发起协同申请，运营收到协同通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_requested` |
| 触发场景 | 销售在客资详情页发起协同申请 |
| 接收端 | 客资来源运营 operation_001 |
| 优先级 | **P0** |

**前置条件：**
1. 销售账号 sales_001 持有客资 L-001（来源运营 operation_001）
2. 运营 operation_001 在线（WebSocket 已连接）
3. 协同任务表 `collaboration_tasks` 可写入

**测试步骤：**

1. 销售（sales_001）登录销售端
2. 进入客资 L-001 详情页
3. 点击"协同申请"按钮
4. 选择协同类型（提醒客户/补充信息/确认身份/二次触达）
5. 填写协同原因，点击提交
6. 记录提交时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='collaboration_requested'，receiver_id=operation_001.id | SQL 查询 |
| DB 状态 | `collaboration_tasks` 表新增任务记录，status='pending' | SQL 查询 |
| WebSocket 推送 | operation_001 在 T1 + 3 秒内收到 `collaboration.requested` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='collaboration_requested'，relatedType='collaboration_task'，relatedId=任务ID | WebSocket 消息解析 |
| routeHint | 格式为 `/operation/collaboration?taskId={taskId}` | payload.routeHint |

**实际结果：** （留空）

**备注：**
- 验证通知 title 为"协同任务待处理"
- 验证通知 content 包含客资联系信息

---

#### TC-NOT-003：销售标记客户未通过，运营收到客户未通过通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `customer_not_passed` |
| 触发场景 | 销售在客资详情标记客户未通过 |
| 接收端 | 客资来源运营 operation_001 |
| 优先级 | **P0** |

**前置条件：**
1. 销售账号 sales_001 持有客资 L-002（来源运营 operation_001）
2. 客资 add_status 当前为 'not_added' 或 'applied'

**测试步骤：**

1. 销售（sales_001）登录销售端
2. 进入客资 L-002 详情页
3. 点击"客户未通过"按钮
4. 确认操作
5. 记录操作时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='customer_not_passed'，receiver_id=operation_001.id | SQL 查询 |
| DB 状态 | `leads` 表 L-002 的 add_status 更新为 'not_passed' | SQL 查询 |
| WebSocket 推送 | operation_001 在 T1 + 3 秒内收到 `lead.customer_not_passed` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='customer_not_passed'，relatedType='lead' | WebSocket 消息解析 |

**实际结果：** （留空）

---

#### TC-NOT-004：运营处理协同任务，销售收到协同已处理通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_handled` |
| 触发场景 | 运营处理销售发起的协同任务 |
| 接收端 | 协同发起销售 sales_001 |
| 优先级 | **P0** |

**前置条件：**
1. 存在待处理协同任务 T-001（发起人 sales_001，处理人 operation_001）
2. 协同任务状态为 'handling' 或 'pending'

**测试步骤：**

1. 运营（operation_001）登录运营端
2. 进入协同处理页面，找到任务 T-001
3. 填写处理备注（必填）
4. 点击"确认处理"按钮
5. 记录处理时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='collaboration_handled'，receiver_id=sales_001.id | SQL 查询 |
| DB 状态 | `collaboration_tasks` 表 T-001 的 status='handled' | SQL 查询 |
| WebSocket 推送 | sales_001 在 T1 + 3 秒内收到 `collaboration.handled` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='collaboration_handled'，content 包含处理备注 | WebSocket 消息解析 |
| routeHint | 格式为 `/sales/collaboration?taskId={taskId}` | payload.routeHint |

**实际结果：** （留空）

**备注：**
- 验证 `handledNote`（处理备注）已写入通知 content
- 验证 `relatedId` 指向任务 ID 而非客资 ID

---

#### TC-NOT-005：销售标记客户已添加，运营收到客户已添加通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `customer_added` |
| 触发场景 | 销售标记客户已添加通过 |
| 接收端 | 客资来源运营 operation_001 |
| 优先级 | **P0** |

**前置条件：**
1. 销售账号 sales_001 持有客资 L-003（来源运营 operation_001）
2. 客资状态允许标记为已添加

**测试步骤：**

1. 销售（sales_001）登录销售端
2. 进入客资 L-003 详情页
3. 点击"已添加通过"按钮
4. 确认操作
5. 记录操作时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='customer_added'，receiver_id=operation_001.id | SQL 查询 |
| DB 状态 | `leads` 表 L-003 的 add_status='added' | SQL 查询 |
| WebSocket 推送 | operation_001 在 T1 + 3 秒内收到 `lead.added_success` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='customer_added'，relatedType='lead' | WebSocket 消息解析 |

**实际结果：** （留空）

---

#### TC-NOT-006：销售成交创建订单，教务和主管收到新订单通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_created` |
| 触发场景 | 销售标记成交，创建订单 |
| 接收端 | 教务 academic_001、主管 supervisor_001 |
| 优先级 | **P0** |

**前置条件：**
1. 销售账号 sales_001 持有客资 L-004（状态允许成交）
2. 教务账号 academic_001、主管账号 supervisor_001 已存在
3. 教务在线（WebSocket 已连接）

**测试步骤：**

1. 销售（sales_001）登录销售端
2. 进入客资 L-004 详情页
3. 点击"标记成交"按钮
4. 填写成交金额、产品类型、合同状态、付款状态、交付要求
5. 点击确认
6. 记录操作时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增 2 条记录，type_code='order_created' | SQL 查询 |
| DB 状态 | receiver_id 分别为 academic_001.id 和 supervisor_001.id | SQL 查询 |
| DB 状态 | `orders` 表新增订单记录，source_lead_id=L-004.id，sales_user_id=sales_001.id | SQL 查询 |
| WebSocket 推送 | academic_001 和 supervisor_001 在 T1 + 3 秒内收到 `order.created` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='order_created'，relatedType='order'，relatedId=订单ID | WebSocket 消息解析 |
| routeHint | academic 端为 `/academic/orders/{orderId}` | payload.routeHint |

**实际结果：** （留空）

---

#### TC-NOT-007：教务更新订单进度，销售和主管收到订单更新通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_updated` |
| 触发场景 | 教务更新订单节点状态 |
| 接收端 | 订单销售 sales_001、主管 supervisor_001 |
| 优先级 | **P0** |

**前置条件：**
1. 存在订单 O-001（销售 sales_001，教务 academic_001）
2. 订单当前状态为 'in_progress'
3. 销售和主管在线

**测试步骤：**

1. 教务（academic_001）登录教务端
2. 进入订单 O-001 详情页
3. 更新订单进度（如标记"资料已收齐"）
4. 记录操作时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='order_updated' | SQL 查询 |
| DB 状态 | receiver_id 包含 sales_001.id 和 supervisor_001.id | SQL 查询 |
| DB 状态 | `order_follow_records` 表新增跟进记录 | SQL 查询 |
| WebSocket 推送 | sales_001 和 supervisor_001 在 T1 + 3 秒内收到 `order.updated` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='order_updated'，content 包含变更字段名 | WebSocket 消息解析 |
| 通知 title | "订单更新" | payload.title |

**实际结果：** （留空）

---

#### TC-NOT-008：教务提交订单异常，销售和主管收到订单异常通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_abnormal` |
| 触发场景 | 教务提交订单异常反馈 |
| 接收端 | 订单销售 sales_001、主管 supervisor_001 |
| 优先级 | **P0** |

**前置条件：**
1. 存在订单 O-002（销售 sales_001）
2. 教务账号 academic_001 有权限操作

**测试步骤：**

1. 教务（academic_001）登录教务端
2. 进入订单 O-002 详情页
3. 点击"异常反馈"按钮
4. 选择异常类型（客户不配合/资料缺失/老师未响应等）
5. 填写异常说明
6. 点击提交
7. 记录操作时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='order_abnormal' | SQL 查询 |
| DB 状态 | `order_abnormal_feedbacks` 表新增异常记录 | SQL 查询 |
| WebSocket 推送 | sales_001 和 supervisor_001 在 T1 + 3 秒内收到 `order.abnormal` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='order_abnormal'，relatedType='order' | WebSocket 消息解析 |
| 通知 title | "订单异常" | payload.title |

**实际结果：** （留空）

---

#### TC-NOT-009：导出任务完成，用户收到导出完成通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `export_done` |
| 触发场景 | 导出任务状态变为 'success' |
| 接收端 | 发起导出的用户 |
| 优先级 | **P1** |

**前置条件：**
1. 用户账号发起了一个导出任务（类型：posts/leads/orders 等）
2. 导出任务最终状态为 'success'

**测试步骤：**

1. 用户登录任意端口
2. 进入导出功能，创建一个导出任务
3. 等待导出任务完成（或模拟任务完成）
4. 记录完成时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='export_done'，receiver_id=发起人.id | SQL 查询 |
| DB 状态 | `exports` 表对应任务 status='success'，file_url 有值 | SQL 查询 |
| WebSocket 推送 | 发起人在 T1 + 3 秒内收到 `export.finished` 事件 | 网络抓包 |
| 事件内容 | payload.typeCode='export_done'，relatedType='export'，relatedId=导出任务ID | WebSocket 消息解析 |
| routeHint | 格式为 `/academic/exports?taskId={taskId}` | payload.routeHint |

**实际结果：** （留空）

---

#### TC-NOT-010：协同任务超时，@Cron 扫描器发送超时通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout` |
| 触发场景 | @Cron 扫描器检测到超时协同任务（>24 小时未处理） |
| 接收端 | 协同来源运营 operation_001、主管 supervisor_001 |
| 优先级 | **P0** |

**前置条件：**
1. 存在协同任务 T-002（状态为 'pending' 或 'handling'）
2. 任务 created_at 距今超过 24 小时
3. @Cron 调度器正常运行（每 30 分钟）

**测试步骤：**

1. 手动设置协同任务 T-002 的 created_at 为 25 小时前
2. 等待 @Cron 扫描器触发（最多等待 30 分钟，或手动触发 `scanTimeouts` 接口）
3. 记录触发时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增记录，type_code='collaboration_timeout' | SQL 查询 |
| DB 状态 | receiver_id 包含任务 handlerId、requesterId、admin 角色用户 | SQL 查询 |
| DB 状态 | `collaboration_tasks` 表 T-002 的 status='timeout' | SQL 查询 |
| WebSocket 推送 | 相关用户在 T1 + 3 秒内收到通知 | 网络抓包 |
| 通知 title | "协同任务超时" | payload.title |
| 通知 content | 包含超时时长（如"已超过 24 小时未处理"） | payload.content |
| 操作日志 | `operation_logs` 表新增记录，action='status_change'，detail 包含 timeout | SQL 查询 |

**实际结果：** （留空）

**备注：**
- `collaboration_timeout` 通知没有独立的 WebSocket 业务事件，走通用的 `notification.created`
- 验证扫描器幂等性：已 timeout 状态的任务不会再被处理

---

### 4.2 通知查询与筛选

#### TC-NOT-011：查询未读通知列表

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户打开消息中心 |
| 接收端 | - |
| 优先级 | **P0** |

**前置条件：**
1. 用户账号有若干未读和已读通知

**测试步骤：**

1. 用户登录任意端口
2. 调用 `GET /api/notifications?status=unread&limit=20`
3. 记录响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应结构 | 包含 items、unreadCount、total、limit、offset | JSON 断言 |
| 排序规则 | 未读优先，同类按 createdAt DESC | items 数组顺序 |
| 分页限制 | 默认 limit=20，最大不超过 200 | 响应 limit 字段 |
| 权限过滤 | 仅返回当前用户的通知 | 对比 receiverId |

**实际结果：** （留空）

---

#### TC-NOT-012：按通知类型筛选

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户只想看某一类通知 |
| 接收端 | - |
| 优先级 | **P1** |

**前置条件：**
1. 用户账号有多种类型的通知

**测试步骤：**

1. 调用 `GET /api/notifications?type=lead_assigned`
2. 调用 `GET /api/notifications?type=order_created`
3. 对比两个响应的 items

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 筛选结果 | items 中所有通知的 typeCode 均等于请求的 type 值 | 遍历断言 |
| 分页正确 | total 仅计算筛选后的数量 | 对比 total |

**实际结果：** （留空）

---

#### TC-NOT-013：按端口类型筛选

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 运营只看运营端通知，销售只看销售端通知 |
| 接收端 | - |
| 优先级 | **P1** |

**前置条件：**
1. 用户有不同 portType 的通知

**测试步骤：**

1. 销售账号调用 `GET /api/notifications?portType=sales`
2. 检查响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 筛选结果 | items 中所有通知的 portType='sales' | 遍历断言 |
| 未读数 | unreadCount 仅统计 sales 端口通知 | 对比 count |

**实际结果：** （留空）

---

### 4.3 通知已读操作

#### TC-NOT-014：标记单条通知已读

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户点击单条通知 |
| 接收端 | - |
| 优先级 | **P0** |

**前置条件：**
1. 用户账号有未读通知 N-001

**测试步骤：**

1. 调用 `POST /api/notifications/N-001/read` 或 `PATCH /api/notifications/N-001/read`
2. 检查响应
3. 查询 DB 确认状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应 | `{ok: true, changed: true}` | JSON 断言 |
| DB 状态 | `notifications` 表 N-001 的 read_status=1 | SQL 查询 |
| 未读数 | `GET /api/notifications/unread-count` 返回值 -1 | API 响应对比 |
| 越权检查 | 非接收者调用返回 404 | 跨用户测试 |

**实际结果：** （留空）

---

#### TC-NOT-015：标记全部已读

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户点击"全部已读"按钮 |
| 接收端 | - |
| 优先级 | **P0** |

**前置条件：**
1. 用户账号有多条未读通知

**测试步骤：**

1. 调用 `POST /api/notifications/read-all` 或 `POST /api/notifications/mark-all-read`
2. 检查响应
3. 查询 DB 确认所有通知已读

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应 | `{ok: true, affected: N}`（N为未读数） | JSON 断言 |
| DB 状态 | 用户所有未读通知的 read_status=1 | SQL 查询 |
| 未读数 | `GET /api/notifications/unread-count` 返回 0 | API 响应 |

**实际结果：** （留空）

---

#### TC-NOT-016：按类型标记全部已读

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户只想清除某一类通知的未读状态 |
| 接收端 | - |
| 优先级 | **P2** |

**前置条件：**
1. 用户账号有多种类型的未读通知

**测试步骤：**

1. 调用 `POST /api/notifications/mark-all-read`，body 为 `{typeCode: 'lead_assigned'}`
2. 检查响应
3. 查询 DB 确认只有 lead_assigned 类型通知已读

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应 | `{ok: true, affected: M}`（M为lead_assigned未读数） | JSON 断言 |
| DB 状态 | lead_assigned 通知 read_status=1，其他类型不变 | SQL 查询 |

**实际结果：** （留空）

---

#### TC-NOT-017：批量标记已读

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 用户勾选多条通知并标记已读 |
| 接收端 | - |
| 优先级 | **P1** |

**前置条件：**
1. 用户账号有至少 3 条未读通知

**测试步骤：**

1. 调用 `POST /api/notifications/mark-read`，body 为 `{ids: ['N-001', 'N-002', 'N-003']}`
2. 检查响应
3. 查询 DB

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应 | `{ok: true, affected: 3}` | JSON 断言 |
| DB 状态 | 3 条通知 read_status=1 | SQL 查询 |
| 去重处理 | 传入重复 ID 只更新一次 | SQL 查询 affected |

**实际结果：** （留空）

---

### 4.4 通知跳转参数

#### TC-NOT-018：客资通知跳转验证

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_assigned` / `customer_not_passed` / `customer_added` |
| 触发场景 | 用户点击客资相关通知 |
| 接收端 | 销售/运营 |
| 优先级 | **P0** |

**前置条件：**
1. 存在客资通知 N-002（typeCode='lead_assigned'，relatedId=L-005，relatedType='lead'）

**测试步骤：**

1. 查询通知 N-002 的 routeHint 字段
2. 根据 routeHint 构造跳转 URL
3. 使用对应角色账号访问该 URL

**预期结果：**

| 路由 | 角色 | 跳转路径 | 验证 |
|------|------|----------|------|
| 销售端 | sales | `/sales/leads/L-005` | 页面加载客资详情 |
| 运营端 | operation | `/operation/leads?leadId=L-005` | 页面展示客资信息 |

**实际结果：** （留空）

---

#### TC-NOT-019：协同任务通知跳转验证

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_requested` / `collaboration_handled` |
| 触发场景 | 用户点击协同相关通知 |
| 接收端 | 销售/运营 |
| 优先级 | **P0** |

**前置条件：**
1. 存在协同通知 N-003（relatedId=T-003，relatedType='collaboration_task'）

**测试步骤：**

1. 查询通知 N-003 的 routeHint
2. 访问 routeHint 路径

**预期结果：**

| 路由 | 角色 | 跳转路径 | 验证 |
|------|------|----------|------|
| 销售端 | sales | `/sales/collaboration?taskId=T-003` | 页面展示协同任务 |
| 运营端 | operation | `/operation/collaboration?taskId=T-003` | 页面展示协同任务 |

**实际结果：** （留空）

---

#### TC-NOT-020：订单通知跳转验证

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_created` / `order_updated` / `order_abnormal` |
| 触发场景 | 用户点击订单相关通知 |
| 接收端 | 销售/教务/主管 |
| 优先级 | **P0** |

**前置条件：**
1. 存在订单通知 N-004（relatedId=O-003，relatedType='order'）

**测试步骤：**

1. 查询通知 N-004 的 routeHint
2. 访问 routeHint 路径

**预期结果：**

| 路由 | 角色 | 跳转路径 | 验证 |
|------|------|----------|------|
| 销售端 | sales | `/sales/orders/O-003` | 页面展示订单详情 |
| 教务端 | academic | `/academic/orders/O-003` | 页面展示订单详情 |

**实际结果：** （留空）

---

## 五、WebSocket 事件测试用例

### 5.1 通用事件测试

#### TC-NOT-021：Socket.IO 连接成功

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `notification.connected` / `notification:connected` |
| 触发场景 | WebSocket 连接建立后 |
| 接收端 | 客户端 |
| 优先级 | **P0** |

**前置条件：**
1. 用户已登录，持有有效 token
2. Socket.IO 客户端已初始化

**测试步骤：**

1. 初始化 Socket.IO 连接，传入 auth token
2. 监听 `notification.connected` 事件
3. 等待事件触发

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 立即收到 `notification.connected` | 事件回调 |
| 事件内容 | `{ok: true, userId: 'xxx'}` | payload 解析 |
| 连接状态 | socket.connected === true | socket 实例状态 |

**实际结果：** （留空）

---

#### TC-NOT-022：Socket.IO 认证失败

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `notification:error` |
| 触发场景 | 使用无效 token 连接 |
| 接收端 | 客户端 |
| 优先级 | **P0** |

**前置条件：**
1. 用户未登录或 token 已过期

**测试步骤：**

1. 使用无效 token 初始化 Socket.IO 连接
2. 监听 `notification:error` 事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `notification:error` | 事件回调 |
| 错误消息 | "登录状态已失效，请重新登录" | payload.message |
| 连接状态 | socket 被自动断开 | socket.connected === false |

**实际结果：** （留空）

---

### 5.2 业务事件映射测试

#### TC-NOT-023：lead_assigned 同时触发通用事件和业务事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `notification.created` + `lead.assigned` |
| 触发场景 | 运营分配客资 |
| 接收端 | 销售 |
| 优先级 | **P0** |

**前置条件：**
1. 销售账号 sales_001 已连接 WebSocket
2. 运营已登录

**测试步骤：**

1. 销售端连接 WebSocket，同时监听 `notification.created` 和 `lead.assigned`
2. 运营分配客资给 sales_001
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通用事件 | 收到 `notification.created`，payload.typeCode='lead_assigned' | 事件回调 |
| 业务事件 | 同时收到 `lead.assigned`，内容与通用事件一致 | 事件回调 |
| 推送时间 | 两个事件在同一次推送中到达（间隔 < 50ms） | 时间戳对比 |

**实际结果：** （留空）

---

#### TC-NOT-024：collaboration_requested 触发协同申请事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `collaboration.requested` |
| 触发场景 | 销售发起协同申请 |
| 接收端 | 运营 |
| 优先级 | **P0** |

**前置条件：**
1. 运营已连接 WebSocket

**测试步骤：**

1. 运营连接 WebSocket，监听 `collaboration.requested`
2. 销售发起协同申请
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `collaboration.requested` | 事件回调 |
| payload | typeCode='collaboration_requested'，relatedType='collaboration_task' | 字段断言 |

**实际结果：** （留空）

---

#### TC-NOT-025：customer_not_passed 触发客户未通过事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `lead.customer_not_passed` |
| 触发场景 | 销售标记客户未通过 |
| 接收端 | 运营 |
| 优先级 | **P0** |

**测试步骤：**
1. 运营连接 WebSocket，监听 `lead.customer_not_passed`
2. 销售标记客户未通过
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `lead.customer_not_passed` | 事件回调 |
| payload | typeCode='customer_not_passed' | 字段断言 |

**实际结果：** （留空）

---

#### TC-NOT-026：collaboration_handled 触发协同已处理事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `collaboration.handled` |
| 触发场景 | 运营处理协同任务 |
| 接收端 | 销售 |
| 优先级 | **P0** |

**测试步骤：**
1. 销售连接 WebSocket，监听 `collaboration.handled`
2. 运营处理协同任务
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `collaboration.handled` | 事件回调 |
| payload | typeCode='collaboration_handled'，content 包含处理备注 | 字段断言 |

**实际结果：** （留空）

---

#### TC-NOT-027：customer_added 触发客户已添加事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `lead.added_success` |
| 触发场景 | 销售标记客户已添加通过 |
| 接收端 | 运营 |
| 优先级 | **P0** |

**测试步骤：**
1. 运营连接 WebSocket，监听 `lead.added_success`
2. 销售标记客户已添加
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `lead.added_success` | 事件回调 |
| payload | typeCode='customer_added' | 字段断言 |

**实际结果：** （留空）

---

#### TC-NOT-028：order_created 触发新订单事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `order.created` |
| 触发场景 | 销售成交创建订单 |
| 接收端 | 教务、主管 |
| 优先级 | **P0** |

**测试步骤：**
1. 教务和主管分别连接 WebSocket，监听 `order.created`
2. 销售成交创建订单
3. 记录各自收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 教务收到 | 收到 `order.created`，typeCode='order_created' | 事件回调 |
| 主管收到 | 收到 `order.created`，typeCode='order_created' | 事件回调 |
| relatedId | 两者收到的是同一个订单 ID | payload 对比 |

**实际结果：** （留空）

---

#### TC-NOT-029：order_updated 触发订单更新事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `order.updated` |
| 触发场景 | 教务更新订单进度 |
| 接收端 | 销售、主管 |
| 优先级 | **P0** |

**测试步骤：**
1. 销售和主管分别连接 WebSocket，监听 `order.updated`
2. 教务更新订单进度
3. 记录各自收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 销售收到 | 收到 `order.updated`，typeCode='order_updated' | 事件回调 |
| 主管收到 | 收到 `order.updated`，typeCode='order_updated' | 事件回调 |
| 内容 | payload.content 包含变更字段名 | 字符串断言 |

**实际结果：** （留空）

---

#### TC-NOT-030：order_abnormal 触发订单异常事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `order.abnormal` |
| 触发场景 | 教务提交订单异常 |
| 接收端 | 销售、主管 |
| 优先级 | **P0** |

**测试步骤：**
1. 销售和主管分别连接 WebSocket，监听 `order.abnormal`
2. 教务提交订单异常
3. 记录各自收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 销售收到 | 收到 `order.abnormal`，typeCode='order_abnormal' | 事件回调 |
| 主管收到 | 收到 `order.abnormal`，typeCode='order_abnormal' | 事件回调 |

**实际结果：** （留空）

---

#### TC-NOT-031：export_done 触发导出完成事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | `export.finished` |
| 触发场景 | 导出任务完成 |
| 接收端 | 发起人 |
| 优先级 | **P1** |

**测试步骤：**
1. 用户连接 WebSocket，监听 `export.finished`
2. 发起导出任务并等待完成
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件触发 | 收到 `export.finished`，typeCode='export_done' | 事件回调 |
| relatedType | 'export' | 字段断言 |

**实际结果：** （留空）

---

## 六、消息中心功能测试用例

### 6.1 消息列表展示

#### TC-NOT-032：消息列表按时间倒序展示

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户打开消息中心 |
| 优先级 | **P0** |

**前置条件：**
1. 用户有 10 条以上通知

**测试步骤：**

1. 调用 `GET /api/notifications?limit=20`
2. 检查 items 数组的 createdAt 顺序

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 排序规则 | items[i].createdAt >= items[i+1].createdAt | 遍历断言 |
| 未读优先 | 未读通知排在已读之前 | 遍历断言 |

**实际结果：** （留空）

---

#### TC-NOT-033：消息列表分页加载

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户滚动消息列表，加载更多 |
| 优先级 | **P0** |

**前置条件：**
1. 用户有超过 20 条通知

**测试步骤：**

1. 调用 `GET /api/notifications?limit=20&offset=0`，记录 total
2. 调用 `GET /api/notifications?limit=20&offset=20`
3. 对比两次结果

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 总数一致 | 两次请求的 total 相同 | 数值对比 |
| 数据不重复 | 两次 items 无重复 ID | 数组对比 |
| 顺序连续 | offset=20 的第一条是 offset=0 最后一条的下一条 | 时间戳对比 |

**实际结果：** （留空）

---

### 6.2 未读数与红点

#### TC-NOT-034：顶部 Badge 显示未读数

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户登录后查看顶部导航 |
| 优先级 | **P0** |

**前置条件：**
1. 用户有 5 条未读通知

**测试步骤：**

1. 用户登录
2. 检查顶部消息图标上的 Badge 数字

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Badge 数字 | 显示 5 | UI 断言 |
| 与接口一致 | `GET /api/notifications/unread-count` 返回 5 | API 对比 |

**实际结果：** （留空）

---

#### TC-NOT-035：收到新通知后未读数实时更新

| 字段 | 内容 |
|------|------|
| 触发场景 | 在线用户收到新通知 |
| 优先级 | **P0** |

**前置条件：**
1. 用户在线（WebSocket 已连接）
2. 当前未读数为 3

**测试步骤：**

1. 记录当前未读数 N=3
2. 触发一个新通知（如运营分配客资）
3. 记录时间 T1
4. 等待 3 秒内观察 Badge 变化

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Badge 更新 | 在 T1 + 3 秒内变为 N+1=4 | UI 断言/控制台日志 |
| WebSocket 更新 | Badge 通过 socket 事件实时刷新 | 网络抓包 |

**实际结果：** （留空）

---

### 6.3 消息操作

#### TC-NOT-036：点击消息标记已读并跳转

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户点击消息列表中的某条消息 |
| 优先级 | **P0** |

**前置条件：**
1. 用户有未读消息 N-005

**测试步骤：**

1. 记录当前未读数 N
2. 点击消息 N-005
3. 检查页面跳转和状态变化

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 页面跳转 | 跳转到 routeHint 指定的页面 | URL 断言 |
| 已读状态 | N-005 的 unread 变为 false | 列表刷新后验证 |
| 未读数 | 变为 N-1 | Badge 数字 |
| 跳转延迟 | < 1 秒 | 时间测量 |

**实际结果：** （留空）

---

#### TC-NOT-037：消息列表支持刷新

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户点击刷新按钮 |
| 优先级 | **P1** |

**前置条件：**
1. 用户已打开消息列表

**测试步骤：**

1. 点击刷新按钮
2. 检查列表是否重新加载

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 加载状态 | 显示 loading 指示器 | UI 断言 |
| 刷新完成 | 列表更新为最新数据 | createdAt 对比 |

**实际结果：** （留空）

---

## 七、实时推送测试用例

### 7.1 在线推送时效性

#### TC-NOT-038：在线用户 3 秒内收到实时推送

| 字段 | 内容 |
|------|------|
| 触发场景 | 业务操作产生通知 |
| 优先级 | **P0** |

**前置条件：**
1. 接收用户在线（WebSocket 已连接）
2. 发送用户已登录

**测试步骤：**

1. 记录当前时间 T0
2. 发送用户执行操作（如分配客资）
3. 记录收到 WebSocket 事件时间 T1
4. 计算延迟 T = T1 - T0

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 推送延迟 | T < 3 秒 | 时间戳断言 |
| 事件完整性 | payload 包含所有必要字段 | JSON Schema 验证 |

**实际结果：** （留空）

**备注：**
- 多次测试取平均值，p95 应 < 3 秒
- 排除网络波动因素，在内网环境下测试

---

#### TC-NOT-039：通知入库后才推送

| 字段 | 内容 |
|------|------|
| 触发场景 | 通知创建流程验证 |
| 优先级 | **P1** |

**测试步骤：**

1. 发送用户执行操作触发通知
2. 立即查询 DB：`SELECT * FROM notifications WHERE type_code='xxx' ORDER BY created_at DESC LIMIT 1`
3. 记录 DB 插入时间 T_db
4. 记录 WebSocket 推送时间 T_ws

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 顺序 | T_db <= T_ws | 时间戳对比 |
| 数据一致性 | DB 记录与 WS payload 完全一致 | JSON 对比 |

**实际结果：** （留空）

---

### 7.2 离线补看

#### TC-NOT-040：用户离线后上线能看到离线期间的通知

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户断线重连后查看消息 |
| 优先级 | **P0** |

**前置条件：**
1. 用户 A 在线，收到 2 条通知（标记为已读）
2. 用户 B 离线

**测试步骤：**

1. 用户 A 断开 WebSocket 连接（不关闭页面）
2. 模拟发送 3 条新通知给用户 A（通过其他端口操作）
3. 用户 A 重新连接 WebSocket
4. 用户 A 调用 `GET /api/notifications?status=unread`

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| WebSocket 推送 | 重连后立即收到离线期间的 3 条通知 | 事件回调计数 |
| HTTP 补看 | API 返回 3 条未读通知 | items.length |
| 未读数 | Badge 显示 3 | UI 断言 |
| 数据完整性 | 离线通知包含完整的 relatedId、routeHint | 字段断言 |

**实际结果：** （留空）

---

### 7.3 兜底轮询

#### TC-NOT-041：WebSocket 断线时，60 秒轮询能获取通知

| 字段 | 内容 |
|------|------|
| 触发场景 | WebSocket 不可用时的通知获取 |
| 优先级 | **P0** |

**前置条件：**
1. 用户已登录，NotificationContext 已初始化
2. 禁用 WebSocket（mock 或阻断）

**测试步骤：**

1. 手动关闭 WebSocket 连接
2. 模拟发送 1 条通知给用户
3. 等待 60 秒（POLL_INTERVAL_MS）
4. 记录期间是否收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 轮询触发 | 60 秒后自动调用 `GET /api/notifications` | 网络请求日志 |
| 通知获取 | 用户界面更新，显示新通知 | UI 断言 |
| 未读数更新 | Badge 数字 +1 | UI 断言 |

**实际结果：** （留空）

**备注：**
- 测试时可通过 Chrome DevTools Network 禁用 WebSocket 域名
- 验证轮询间隔为 60 秒（60000ms）

---

## 八、协同超时扫描器测试用例

### 8.1 @Cron 扫描器功能

#### TC-NOT-042：扫描器每 30 分钟执行一次

| 字段 | 内容 |
|------|------|
| 触发场景 | @Cron 定时任务触发 |
| 优先级 | **P0** |

**前置条件：**
1. @Cron 调度器正常运行
2. 存在超时协同任务 T-003（created_at 25 小时前）

**测试步骤：**

1. 检查 NestJS 调度器配置 `@Cron(CronExpression.EVERY_30_MINUTES)`
2. 等待下一个 30 分钟边界（或查看调度器日志）
3. 检查日志中是否有 "collab timeout scan" 记录

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 执行频率 | 30 分钟执行一次 | 日志时间间隔 |
| 任务处理 | 日志显示 `scanned=X marked=Y notified=Z` | 日志内容 |
| 幂等性 | 重复执行不会重复标记/通知 | DB 状态检查 |

**实际结果：** （留空）

---

#### TC-NOT-043：超时任务标记为 timeout 状态

| 字段 | 内容 |
|------|------|
| 触发场景 | 扫描器处理超时任务 |
| 优先级 | **P0** |

**前置条件：**
1. 协同任务 T-004：状态='pending'，created_at=26 小时前

**测试步骤：**

1. 触发扫描器执行
2. 查询 T-004 的状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `collaboration_tasks`.status='timeout' | SQL 查询 |
| 时间戳 | updated_at 为扫描执行时间 | SQL 查询 |
| 操作日志 | `operation_logs` 有 status_change 记录 | SQL 查询 |

**实际结果：** （留空）

---

#### TC-NOT-044：超时通知发送给运营和主管

| 字段 | 内容 |
|------|------|
| 触发场景 | 扫描器发送超时通知 |
| 优先级 | **P0** |

**前置条件：**
1. 协同任务 T-005 超时（handlerId=operation_001，requesterId=sales_001）
2. 主管账号 supervisor_001（role=admin）存在

**测试步骤：**

1. 触发扫描器执行
2. 查询 `notifications` 表
3. 通知接收者在线则检查 WebSocket 推送

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 接收者 | operation_001、supervisor_001 收到通知 | SQL 查询 |
| typeCode | 'collaboration_timeout' | SQL 查询 |
| 通知内容 | 包含任务 ID 和超时时长 | content 字段 |
| 运营收到 | operation_001 在线时收到 WS 推送 | 网络抓包 |
| 主管收到 | supervisor_001 在线时收到 WS 推送 | 网络抓包 |

**实际结果：** （留空）

---

#### TC-NOT-045：已超时任务不再重复通知

| 字段 | 内容 |
|------|------|
| 触发场景 | 扫描器重复执行 |
| 优先级 | **P1** |

**前置条件：**
1. 协同任务 T-006 已标记为 timeout

**测试步骤：**

1. 记录当前通知数量 N
2. 触发扫描器执行
3. 记录执行后通知数量 M

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | M = N（无新增） | 数值对比 |
| DB 状态 | T-006 状态仍为 timeout | SQL 查询 |
| 日志 | "skipped" 或 "already timeout" | 日志内容 |

**实际结果：** （留空）

---

### 8.2 扫描器边界条件

#### TC-NOT-046：临近超时边界的任务不处理

| 字段 | 内容 |
|------|------|
| 触发场景 | 任务创建时间未超 24 小时 |
| 优先级 | **P2** |

**前置条件：**
1. 协同任务 T-007：状态='pending'，created_at=23 小时前

**测试步骤：**

1. 触发扫描器执行
2. 查询 T-007 的状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | T-007 状态仍为 'pending'（未超时） | SQL 查询 |
| 通知 | 无新增超时通知 | SQL 查询 |

**实际结果：** （留空）

---

#### TC-NOT-047：已完成任务不处理

| 字段 | 内容 |
|------|------|
| 触发场景 | 任务已处理或已关闭 |
| 优先级 | **P1** |

**前置条件：**
1. 协同任务 T-008：状态='handled'
2. created_at=48 小时前

**测试步骤：**

1. 触发扫描器执行
2. 查询 T-008 的状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | T-008 状态仍为 'handled' | SQL 查询 |

**实际结果：** （留空）

---

## 九、异常场景测试用例

### 9.1 Socket.IO 断线重连

#### TC-NOT-048：Socket.IO 自动重连机制

| 字段 | 内容 |
|------|------|
| 触发场景 | 网络中断后恢复 |
| 优先级 | **P0** |

**前置条件：**
1. 用户已连接 WebSocket
2. 使用 socket.io-client 客户端

**测试步骤：**

1. 记录当前 socket.id
2. 模拟网络中断（断网 5 秒）
3. 恢复网络
4. 记录重连后的 socket.id 和时间

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 自动重连 | socket 自动重连，无需手动刷新页面 | UI 观察 |
| 重连事件 | 收到 `notification.connected` | 事件回调 |
| 数据完整性 | 重连后收到离线期间的通知 | 事件计数 |

**实际结果：** （留空）

---

#### TC-NOT-049：重连后用户身份正确

| 字段 | 内容 |
|------|------|
| 触发场景 | Socket 重连后验证身份 |
| 优先级 | **P0** |

**测试步骤：**

1. 用户 A 连接 WebSocket
2. 断网重连
3. 检查重连后收到的事件中 userId

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| userId | 重连事件中的 userId = 用户 A.id | payload 断言 |
| 通知归属 | 后续收到的通知都属于自己的 userId | 遍历验证 |

**实际结果：** （留空）

---

### 9.2 多端登录

#### TC-NOT-050：同一用户多端同时收到通知

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户在多个设备/端口同时登录 |
| 优先级 | **P0** |

**前置条件：**
1. 用户 sales_001 在 PC 端和手机端同时登录

**测试步骤：**

1. PC 端连接 WebSocket（userId=sales_001）
2. 手机端连接 WebSocket（userId=sales_001）
3. 触发通知（如运营分配新客资）
4. 记录两端收到通知的时间

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| PC 端收到 | 收到 `lead.assigned` | 事件回调 |
| 手机端收到 | 同时收到 `lead.assigned` | 事件回调 |
| 时间差 | < 500ms | 时间戳对比 |
| 未读数 | 两端 Badge 都 +1 | UI 断言 |

**实际结果：** （留空）

---

#### TC-NOT-051：多端已读状态同步

| 字段 | 内容 |
|------|------|
| 触发场景 | 一端标记已读，另一端状态同步 |
| 优先级 | **P0** |

**前置条件：**
1. 用户 sales_001 在 PC 端和手机端同时在线
2. 有未读通知 N-010

**测试步骤：**

1. 记录两端未读数（均为 1）
2. PC 端点击通知 N-010 标记已读
3. 手机端查看未读数和消息列表

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| PC 端状态 | N-010 变为已读，Badge 0 | UI 断言 |
| 手机端同步 | N-010 也变为已读，Badge 0 | UI 断言 |
| 数据一致性 | 两端消息列表状态一致 | 列表对比 |

**实际结果：** （留空）

---

### 9.3 跨用户隔离

#### TC-NOT-052：用户不能收到他人的通知

| 字段 | 内容 |
|------|------|
| 触发场景 | 验证通知隔离性 |
| 优先级 | **P0** |

**前置条件：**
1. 用户 sales_001 和 sales_002 已登录
2. 运营分配客资给 sales_001

**测试步骤：**

1. sales_001 连接 WebSocket，监听所有事件
2. sales_002 连接 WebSocket，监听所有事件
3. 运营分配客资给 sales_001
4. 检查两端的收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| sales_001 收到 | 收到 `lead.assigned` | 事件回调 |
| sales_002 未收到 | 不应收到任何与 sales_001 客资相关的通知 | 事件计数 = 0 |
| 隔离性 | 两端通知列表完全独立 | API 对比 |

**实际结果：** （留空）

---

#### TC-NOT-053：越权访问通知接口返回 404

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户尝试查看他人通知 |
| 优先级 | **P0** |

**前置条件：**
1. 通知 N-011 属于用户 sales_001
2. 用户 sales_002 已登录

**测试步骤：**

1. sales_002 尝试调用 `POST /api/notifications/N-011/read`
2. 检查响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| HTTP 状态码 | 404 | 响应断言 |
| 响应内容 | `{ok: false, message: '通知不存在'}` | JSON 断言 |
| DB 状态 | N-011 的 read_status 仍为 0 | SQL 查询 |

**实际结果：** （留空）

---

### 9.4 通知未送达场景

#### TC-NOT-054：WebSocket 失败时，轮询兜底确保通知送达

| 字段 | 内容 |
|------|------|
| 触发场景 | WebSocket 推送失败 |
| 优先级 | **P0** |

**前置条件：**
1. 用户在线但 WebSocket 连接不稳定
2. 禁用 WebSocket 域名（模拟失败）

**测试步骤：**

1. 记录当前未读数 N
2. 触发新通知
3. 等待 60 秒轮询触发
4. 检查用户是否收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| WebSocket 失败 | 通知未通过 WS 推送 | 网络日志 |
| 轮询成功 | 60 秒后通过 HTTP 轮询获取通知 | 网络请求 |
| UI 更新 | 用户界面显示新通知 | UI 断言 |

**实际结果：** （留空）

---

#### TC-NOT-055：消息中心显示通知内容完整性

| 字段 | 内容 |
|------|------|
| 触发场景 | 验证离线补看的通知内容 |
| 优先级 | **P1** |

**前置条件：**
1. 用户离线期间收到 5 条通知
2. 用户重新上线

**测试步骤：**

1. 用户调用 `GET /api/notifications?status=unread&limit=20`
2. 检查返回的 items

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 数量 | items.length = 5 | 数值断言 |
| 字段完整 | 每条通知包含 id、title、content、relatedId、routeHint | 字段遍历 |
| 排序正确 | 按 createdAt DESC | 时间戳验证 |

**实际结果：** （留空）

---

### 9.5 性能与并发

#### TC-NOT-056：大批量通知入库性能

| 字段 | 内容 |
|------|------|
| 触发场景 | 批量操作产生多条通知 |
| 优先级 | **P1** |

**前置条件：**
1. 主管改派 50 个客资给不同销售

**测试步骤：**

1. 记录开始时间 T0
2. 执行批量改派操作（50 条）
3. 记录完成时间 T1
4. 查询 DB 确认所有通知入库

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 性能 | T1 - T0 < 5 秒 | 时间测量 |
| 数据完整性 | 50 条通知全部入库 | SQL COUNT |
| 推送 | 各接收者收到自己的通知 | WebSocket 事件 |

**实际结果：** （留空）

---

#### TC-NOT-057：并发推送不丢失通知

| 字段 | 内容 |
|------|------|
| 触发场景 | 多个操作同时产生通知 |
| 优先级 | **P1** |

**前置条件：**
1. 5 个操作同时触发通知

**测试步骤：**

1. 同时执行 5 个操作（每个产生 1 条通知）
2. 记录各方收到的通知总数

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | 5 条通知全部入库 | SQL COUNT |
| 推送完整性 | 各接收者收到所有属于自己的通知 | 事件计数 |
| 无丢失 | 不存在通知静默丢弃 | 日志检查 |

**实际结果：** （留空）

---

## 十三、补充测试用例（增强覆盖）

### 13.1 通知时序与边界测试

#### TC-NOT-058：通知创建后立即查询能看到

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 通知创建后立即查询 |
| 优先级 | **P1** |

**前置条件：**
1. 测试用户已登录

**测试步骤：**

1. 执行操作触发通知（如分配客资）
2. 立即调用 `GET /api/notifications?limit=10`
3. 检查新通知是否在列表中

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 时序一致性 | 新通知出现在列表首位 | items[0] 对比 |
| 数据完整 | 包含所有字段（id, typeCode, title, content, relatedId） | 字段断言 |

**实际结果：** （留空）

---

#### TC-NOT-059：重复通知不创建（幂等性）

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 同一操作重复触发 |
| 优先级 | **P2** |

**前置条件：**
1. 客资 L-010 已分配给销售 sales_001

**测试步骤：**

1. 运营尝试再次分配同一客资给同一销售
2. 检查通知数量

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | 无新增通知（幂等保护） | SQL COUNT |
| 操作响应 | 返回错误或提示"已分配" | 响应断言 |

**实际结果：** （留空）

---

#### TC-NOT-060：通知标题长度限制

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 通知 title 超长 |
| 优先级 | **P2** |

**前置条件：**
1. 客资备注超长

**测试步骤：**

1. 创建客资，备注超过 255 字符
2. 触发通知
3. 检查通知 title 字段

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| title 截断 | title 长度 <= 255 | SQL 长度查询 |
| 完整性 | content 字段保留完整信息 | SQL 查询 |

**实际结果：** （留空）

---

#### TC-NOT-061：空内容通知处理

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 通知 content 为空 |
| 优先级 | **P2** |

**前置条件：**
1. 某些场景下通知 content 可能为空

**测试步骤：**

1. 触发一个 content 为空的协同处理通知
2. 查询通知列表

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 空值处理 | content 字段为 NULL 或空字符串 | SQL 查询 |
| 前端展示 | content 为空时不显示内容区 | UI 断言 |

**实际结果：** （留空）

---

### 13.2 通知并发与竞态测试

#### TC-NOT-062：并发标记同一通知已读

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 多端同时标记已读 |
| 优先级 | **P1** |

**前置条件：**
1. 用户在 PC 和手机端同时在线
2. 有未读通知 N-020

**测试步骤：**

1. PC 端调用 `POST /api/notifications/N-020/read`
2. 手机端同时调用 `POST /api/notifications/N-020/read`
3. 检查 DB 状态和响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | N-020.read_status = 1 | SQL 查询 |
| 响应正确 | 两次响应 changed 值不同（第一次 true，第二次 false） | 响应对比 |
| 乐观锁 | 无数据异常 | 无错误日志 |

**实际结果：** （留空）

---

#### TC-NOT-063：并发创建通知

| 字段 | 内容 |
|------|------|
| 通知类型 | 通用 |
| 触发场景 | 多用户同时操作产生通知 |
| 优先级 | **P1** |

**前置条件：**
1. 10 个运营同时分配客资

**测试步骤：**

1. 10 个运营同时执行分配操作
2. 各销售查询自己的通知数量
3. 记录总通知数

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | 10 条通知全部入库 | SQL COUNT |
| 归属正确 | 每条通知 receiver_id 正确 | SQL GROUP BY |
| 无丢失 | 无通知静默丢弃 | 记录对比 |

**实际结果：** （留空）

---

#### TC-NOT-064：高频推送不丢消息

| 字段 | 内容 |
|------|------|
| 触发场景 | 1 秒内收到多条通知 |
| 优先级 | **P1** |

**前置条件：**
1. 用户在线，WebSocket 已连接

**测试步骤：**

1. 连续触发 10 条通知给同一用户
2. 记录收到的 WebSocket 事件数量
3. 检查事件时间戳

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件数量 | 收到 10 条 WebSocket 事件 | 事件计数 |
| 无丢失 | items 中有 10 条通知 | API 对比 |
| 时间戳 | 事件按创建顺序到达 | 时间戳验证 |

**实际结果：** （留空）

---

### 13.3 WebSocket 深度测试

#### TC-NOT-065：Socket 订阅多个事件

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | 多事件订阅 |
| 触发场景 | 前端订阅多个业务事件 |
| 优先级 | **P1** |

**前置条件：**
1. 用户连接 WebSocket

**测试步骤：**

1. 同时订阅 `lead.assigned`、`order.created`、`order.abnormal`
2. 依次触发这 3 种通知
3. 记录收到的事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事件隔离 | 每种事件只触发对应的回调 | 回调计数 |
| 同时订阅 | 可同时收到多个不同类型事件 | 事件共存 |
| 通用事件 | 同时收到 `notification.created` | 事件计数 |

**实际结果：** （留空）

---

#### TC-NOT-066：Socket 取消订阅

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | unsubscribe |
| 触发场景 | 用户离开页面取消订阅 |
| 优先级 | **P2** |

**测试步骤：**

1. 订阅 `lead.assigned`
2. 取消订阅
3. 触发 lead_assigned 通知
4. 检查是否还收到事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 取消成功 | 取消订阅后不收到事件 | 事件计数 = 0 |
| 其他事件 | 其他订阅仍正常 | 事件计数 > 0 |

**实际结果：** （留空）

---

#### TC-NOT-067：Socket ping/pong 心跳

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | ping/pong |
| 触发场景 | 保持连接活跃 |
| 优先级 | **P2** |

**测试步骤：**

1. 连接 WebSocket
2. 等待 30 秒
3. 检查连接状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 连接保持 | socket.connected = true | 状态断言 |
| 心跳正常 | 无自动断开 | 连接状态 |

**实际结果：** （留空）

---

#### TC-NOT-068：Socket 重连后订阅恢复

| 字段 | 内容 |
|------|------|
| WebSocket 事件 | reconnect |
| 触发场景 | 断线重连后订阅恢复 |
| 优先级 | **P1** |

**前置条件：**
1. 用户订阅了多个事件

**测试步骤：**

1. 建立连接，订阅多个事件
2. 断网触发重连
3. 检查订阅是否自动恢复

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 订阅恢复 | 重连后需重新订阅（或自动恢复） | 事件测试 |
| 通知接收 | 订阅恢复后能收到通知 | 触发测试 |

**实际结果：** （留空）

---

### 13.4 消息中心交互测试

#### TC-NOT-069：消息列表支持下拉刷新

| 字段 | 内容 |
|------|------|
| 触发场景 | 下拉刷新获取最新消息 |
| 优先级 | **P1** |

**前置条件：**
1. 用户已打开消息列表

**测试步骤：**

1. 下拉消息列表
2. 检查是否触发刷新

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 刷新触发 | 调用 `GET /api/notifications` | 网络请求 |
| 列表更新 | 显示最新通知 | 列表对比 |

**实际结果：** （留空）

---

#### TC-NOT-070：消息列表加载状态

| 字段 | 内容 |
|------|------|
| 触发场景 | 消息列表加载中 |
| 优先级 | **P2** |

**测试步骤：**

1. 进入消息中心
2. 观察加载状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 加载指示 | 显示 loading spinner | UI 断言 |
| 数据加载 | 加载完成后显示列表 | UI 断言 |

**实际结果：** （留空）

---

#### TC-NOT-071：空消息列表展示

| 字段 | 内容 |
|------|------|
| 触发场景 | 无通知时的展示 |
| 优先级 | **P1** |

**前置条件：**
1. 用户无任何通知

**测试步骤：**

1. 新用户登录
2. 查看消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 空状态 | 显示"暂无消息" | UI 断言 |
| Badge | Badge 数字为 0 或不显示 | UI 断言 |

**实际结果：** （留空）

---

#### TC-NOT-072：消息列表时间分组展示

| 字段 | 内容 |
|------|------|
| 触发场景 | 按时间分组显示消息 |
| 优先级 | **P2** |

**前置条件：**
1. 用户有不同日期的通知

**测试步骤：**

1. 查看消息列表
2. 检查时间分组

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 分组展示 | 按今天/昨天/更早分组 | UI 断言 |
| 日期显示 | 显示消息日期 | UI 断言 |

**实际结果：** （留空）

---

### 13.5 权限与安全测试

#### TC-NOT-073：游客无法访问通知 API

| 字段 | 内容 |
|------|------|
| 触发场景 | 未登录用户访问 |
| 优先级 | **P0** |

**测试步骤：**

1. 不登录，直接调用 `GET /api/notifications`
2. 检查响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| HTTP 状态码 | 401 Unauthorized | 响应断言 |
| 响应内容 | 拒绝访问 | JSON 断言 |

**实际结果：** （留空）

---

#### TC-NOT-074：接口越权检查

| 字段 | 内容 |
|------|------|
| 触发场景 | 尝试操作用户的通知 |
| 优先级 | **P0** |

**前置条件：**
1. 用户 A 和用户 B 已登录

**测试步骤：**

1. 用户 A 尝试标记用户 B 的通知已读
2. 检查响应

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| HTTP 状态码 | 404 | 响应断言 |
| 数据保护 | 用户 B 的通知状态未改变 | SQL 查询 |

**实际结果：** （留空）

---

#### TC-NOT-075：通知内容 XSS 防护

| 字段 | 内容 |
|------|------|
| 触发场景 | 恶意内容注入 |
| 优先级 | **P1** |

**前置条件：**
1. 通知 content 包含 `<script>` 标签

**测试步骤：**

1. 创建通知，content 包含 `<script>alert(1)</script>`
2. 在前端渲染通知
3. 检查是否执行脚本

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 内容转义 | HTML 特殊字符被转义 | 源码检查 |
| 无执行 | 脚本不执行 | 浏览器测试 |

**实际结果：** （留空）

---

#### TC-NOT-076：通知内容 SQL 注入防护

| 字段 | 内容 |
|------|------|
| 触发场景 | 恶意 SQL 注入 |
| 优先级 | **P1** |

**测试步骤：**

1. 创建通知，content 包含 `' OR '1'='1`
2. 查询通知列表
3. 检查是否执行注入

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 参数化查询 | 使用参数化查询 | 代码检查 |
| 无注入 | 内容作为字符串处理 | 查询结果 |

**实际结果：** （留空）

---

### 13.6 通知状态同步测试

#### TC-NOT-077：已读状态在多端同步

| 字段 | 内容 |
|------|------|
| 触发场景 | 已读状态跨设备同步 |
| 优先级 | **P0** |

**前置条件：**
1. 用户在 PC 端和手机端登录
2. 有未读通知 N-030

**测试步骤：**

1. PC 端标记 N-030 已读
2. 手机端刷新消息列表
3. 检查 N-030 状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 状态同步 | 手机端 N-030 也显示已读 | UI 断言 |
| 未读数同步 | 两端未读数一致 | Badge 对比 |

**实际结果：** （留空）

---

#### TC-NOT-078：通知删除后状态处理

| 字段 | 内容 |
|------|------|
| 触发场景 | 通知被删除 |
| 优先级 | **P2** |

**测试步骤：**

1. 标记通知 N-031 已读
2. 检查列表展示

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 软删除 | 已读通知仍保留在列表中（可查看历史） | 列表检查 |
| 筛选排除 | 可选择"只看未读"隐藏已读 | UI 测试 |

**实际结果：** （留空）

---

### 13.7 协同超时边界场景

#### TC-NOT-079：正好 24 小时的任务不超时

| 字段 | 内容 |
|------|------|
| 触发场景 | 任务创建时间 = 24 小时前 |
| 优先级 | **P2** |

**前置条件：**
1. 协同任务 T-020：created_at = 正好 24 小时前

**测试步骤：**

1. 触发扫描器
2. 检查 T-020 状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | T-020 状态仍为 'pending'（未超时） | SQL 查询 |
| 边界处理 | > 24 小时才超时 | 时间计算验证 |

**实际结果：** （留空）

---

#### TC-NOT-080：扫描器处理大批量超时任务

| 字段 | 内容 |
|------|------|
| 触发场景 | 100+ 任务同时超时 |
| 优先级 | **P1** |

**前置条件：**
1. 准备 100 条超时协同任务

**测试步骤：**

1. 触发扫描器
2. 检查执行时间和结果

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 性能 | 执行时间 < 30 秒 | 时间测量 |
| 批量处理 | 100 条任务全部标记 | SQL COUNT |
| 分批限制 | 扫描器有 batch 限制（100 条/轮） | 代码验证 |

**实际结果：** （留空）

---

#### TC-NOT-081：扫描器并发安全

| 字段 | 内容 |
|------|------|
| 触发场景 | 多实例同时执行扫描 |
| 优先级 | **P1** |

**前置条件：**
1. 运行多个 NestJS 实例

**测试步骤：**

1. 同时触发多个扫描器实例
2. 检查 DB 状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 幂等性 | 每个任务只被处理一次 | SQL COUNT |
| 无重复通知 | 同一任务不会产生多条通知 | 通知数量 |

**实际结果：** （留空）

---

### 13.8 性能与压力测试

#### TC-NOT-082：大量通知分页查询性能

| 字段 | 内容 |
|------|------|
| 触发场景 | 查询有 10000 条通知的用户 |
| 优先级 | **P1** |

**前置条件：**
1. 用户有 10000 条通知记录

**测试步骤：**

1. 调用 `GET /api/notifications?limit=20&offset=0`
2. 测量响应时间

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应时间 | < 500ms | 时间测量 |
| 索引命中 | 使用 idx_notify_receiver_read_created | SQL EXPLAIN |

**实际结果：** （留空）

---

#### TC-NOT-083：未读数查询性能

| 字段 | 内容 |
|------|------|
| 触发场景 | 高频查询未读数 |
| 优先级 | **P1** |

**测试步骤：**

1. 每秒调用 `GET /api/notifications/unread-count` 10 次
2. 测量平均响应时间

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 响应时间 | < 100ms | 时间测量 |
| 索引命中 | 使用索引 | SQL EXPLAIN |

**实际结果：** （留空）

---

#### TC-NOT-084：WebSocket 并发连接数

| 字段 | 内容 |
|------|------|
| 触发场景 | 100 人同时在线 |
| 优先级 | **P1** |

**前置条件：**
1. 准备 100 个 WebSocket 连接

**测试步骤：**

1. 同时建立 100 个 WebSocket 连接
2. 触发通知给所有用户
3. 检查推送成功率

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 连接成功 | 100 个连接全部建立成功 | 连接计数 |
| 推送成功 | 100 个用户都收到通知 | 事件计数 |
| 无阻塞 | 推送延迟 < 5 秒 | 时间测量 |

**实际结果：** （留空）

---

#### TC-NOT-085：通知入库事务性

| 字段 | 内容 |
|------|------|
| 触发场景 | 通知创建与业务操作在同一事务 |
| 优先级 | **P0** |

**前置条件：**
1. 客资创建与通知在同一事务中

**测试步骤：**

1. 执行客资创建操作
2. 模拟事务回滚（数据库错误）
3. 检查通知是否回滚

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 事务回滚 | 通知和客资一起回滚 | SQL 查询 |
| 数据一致性 | 无孤立通知 | 数据检查 |

**实际结果：** （留空）

---

### 13.9 消息推送交互测试

#### TC-NOT-086：Toast 通知展示

| 字段 | 内容 |
|------|------|
| 触发场景 | 收到实时通知 |
| 优先级 | **P1** |

**前置条件：**
1. 用户在线，WebSocket 已连接

**测试步骤：**

1. 触发新通知
2. 观察页面右上角 Toast

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Toast 展示 | 显示通知标题 | UI 断言 |
| 内容显示 | Toast 包含通知内容 | UI 断言 |
| 自动消失 | 3 秒后自动关闭 | 时间测量 |

**实际结果：** （留空）

---

#### TC-NOT-087：通知声音提示

| 字段 | 内容 |
|------|------|
| 触发场景 | 新通知声音提醒 |
| 优先级 | **P2** |

**前置条件：**
1. 浏览器允许声音播放

**测试步骤：**

1. 触发新通知
2. 检查是否有声音提示

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 声音播放 | 播放提示音（如果启用） | 音频元素检查 |
| 静音模式 | 支持关闭声音 | 设置测试 |

**实际结果：** （留空）

---

#### TC-NOT-088：通知勿扰模式

| 字段 | 内容 |
|------|------|
| 触发场景 | 用户设置勿扰模式 |
| 优先级 | **P2** |

**测试步骤：**

1. 设置勿扰模式
2. 触发新通知
3. 检查是否显示 Toast

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Toast 隐藏 | 不显示弹窗 | UI 断言 |
| Badge 更新 | 仍更新未读数 | UI 断言 |
| 列表可见 | 消息中心仍可查看 | UI 测试 |

**实际结果：** （留空）

---

### 13.10 浏览器兼容性测试

#### TC-NOT-089：不同浏览器 WebSocket 支持

| 字段 | 内容 |
|------|------|
| 触发场景 | 浏览器兼容性 |
| 优先级 | **P1** |

**测试步骤：**

1. 在 Chrome、Firefox、Safari、Edge 中测试 WebSocket 连接
2. 触发通知测试推送

**预期结果：**

| 浏览器 | WebSocket 支持 | 推送测试 |
|--------|---------------|----------|
| Chrome | 支持 | PASS |
| Firefox | 支持 | PASS |
| Safari | 支持 | PASS |
| Edge | 支持 | PASS |

**实际结果：** （留空）

---

#### TC-NOT-090：移动端 WebSocket 支持

| 字段 | 内容 |
|------|------|
| 触发场景 | 移动端浏览器 |
| 优先级 | **P1** |

**测试步骤：**

1. 在 iOS Safari、Android Chrome 中测试
2. 检查连接和推送

**预期结果：**

| 设备 | 浏览器 | WebSocket 支持 | 推送测试 |
|------|--------|---------------|----------|
| iPhone | Safari | 支持 | PASS |
| Android | Chrome | 支持 | PASS |

**实际结果：** （留空）

---

## 十四、测试用例统计（更新）

### 14.1 用例分布汇总

| 类别 | 用例数 | P0 用例数 | 备注 |
|------|--------|----------|------|
| 通知创建与入库 | 10 | 9 | 12 种通知类型覆盖 |
| 通知查询与筛选 | 3 | 1 | 按类型/端口/时间筛选 |
| 通知已读操作 | 4 | 3 | 单条/批量/全部已读 |
| 通知跳转参数 | 3 | 3 | 客资/协同/订单跳转 |
| 通知时序与边界 | 4 | 0 | 幂等性、空值、长度 |
| 通知并发与竞态 | 3 | 2 | 并发标记、并发创建 |
| WebSocket 连接 | 2 | 2 | 连接/认证失败 |
| WebSocket 事件 | 10 | 9 | 10 种业务事件映射 |
| WebSocket 深度测试 | 4 | 1 | 订阅、心跳、重连 |
| 消息中心 | 6 | 4 | 列表/Badge/操作 |
| 消息中心交互 | 4 | 1 | 下拉刷新、空状态 |
| 实时推送 | 4 | 3 | 3 秒推送/离线补看/轮询 |
| 协同超时扫描器 | 6 | 4 | @Cron 扫描/通知/边界 |
| 异常场景 | 10 | 7 | 断线重连/多端/隔离 |
| 权限与安全 | 4 | 3 | 越权检查、XSS/SQL 防护 |
| 通知状态同步 | 2 | 1 | 多端同步 |
| 性能与压力 | 4 | 2 | 分页、未读数、并发 |
| 消息推送交互 | 3 | 0 | Toast、声音、勿扰 |
| 浏览器兼容性 | 2 | 0 | 桌面/移动端 |
| **总计** | **88** | **54** | P0 占比 61.4% |

### 14.2 补充用例清单

| 编号 | 用例名称 | 优先级 | 分类 |
|------|----------|--------|------|
| TC-NOT-058 | 通知创建后立即查询能看到 | P1 | 时序与边界 |
| TC-NOT-059 | 重复通知不创建（幂等性） | P2 | 时序与边界 |
| TC-NOT-060 | 通知标题长度限制 | P2 | 时序与边界 |
| TC-NOT-061 | 空内容通知处理 | P2 | 时序与边界 |
| TC-NOT-062 | 并发标记同一通知已读 | P1 | 并发与竞态 |
| TC-NOT-063 | 并发创建通知 | P1 | 并发与竞态 |
| TC-NOT-064 | 高频推送不丢消息 | P1 | 并发与竞态 |
| TC-NOT-065 | Socket 订阅多个事件 | P1 | WebSocket 深度 |
| TC-NOT-066 | Socket 取消订阅 | P2 | WebSocket 深度 |
| TC-NOT-067 | Socket ping/pong 心跳 | P2 | WebSocket 深度 |
| TC-NOT-068 | Socket 重连后订阅恢复 | P1 | WebSocket 深度 |
| TC-NOT-069 | 消息列表支持下拉刷新 | P1 | 消息中心交互 |
| TC-NOT-070 | 消息列表加载状态 | P2 | 消息中心交互 |
| TC-NOT-071 | 空消息列表展示 | P1 | 消息中心交互 |
| TC-NOT-072 | 消息列表时间分组展示 | P2 | 消息中心交互 |
| TC-NOT-073 | 游客无法访问通知 API | P0 | 权限与安全 |
| TC-NOT-074 | 接口越权检查 | P0 | 权限与安全 |
| TC-NOT-075 | 通知内容 XSS 防护 | P1 | 权限与安全 |
| TC-NOT-076 | 通知内容 SQL 注入防护 | P1 | 权限与安全 |
| TC-NOT-077 | 已读状态在多端同步 | P0 | 状态同步 |
| TC-NOT-078 | 通知删除后状态处理 | P2 | 状态同步 |
| TC-NOT-079 | 正好 24 小时的任务不超时 | P2 | 协同超时边界 |
| TC-NOT-080 | 扫描器处理大批量超时任务 | P1 | 协同超时边界 |
| TC-NOT-081 | 扫描器并发安全 | P1 | 协同超时边界 |
| TC-NOT-082 | 大量通知分页查询性能 | P1 | 性能与压力 |
| TC-NOT-083 | 未读数查询性能 | P1 | 性能与压力 |
| TC-NOT-084 | WebSocket 并发连接数 | P1 | 性能与压力 |
| TC-NOT-085 | 通知入库事务性 | P0 | 性能与压力 |
| TC-NOT-086 | Toast 通知展示 | P1 | 消息推送交互 |
| TC-NOT-087 | 通知声音提示 | P2 | 消息推送交互 |
| TC-NOT-088 | 通知勿扰模式 | P2 | 消息推送交互 |
| TC-NOT-089 | 不同浏览器 WebSocket 支持 | P1 | 浏览器兼容性 |
| TC-NOT-090 | 移动端 WebSocket 支持 | P1 | 浏览器兼容性 |

---

**文档结束**
