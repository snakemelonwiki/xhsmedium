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

## 十一、跨端口 3001 P0 缺口测试用例

> **缺口来源**：B 端 v1.2 跨端口 3001 通知链路 + 真实缺陷 PF-04/05/06
> **本章范围**：3001 端口通知接收、跨端口通知推送、未读数同步、Redis 适配

### 11.1 跨端口 3001 通知

#### TC-NOT-091：3000 端口成交订单→3001 端口 owner 收到 lead_deal_done 通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_deal_done`（跨端口） |
| 触发场景 | 销售在 3000 端口成交订单 |
| 接收端 | 3001 端口 owner_test1 |
| 优先级 | **P0** |
| 缺口追溯 | 跨端口通知链路 |

**前置条件：**
1. 销售 sales_test1 在 3000 端口已登录
2. owner_test1 在 3001 端口已登录
3. 客资 L-091 状态 added_success

**测试步骤：**

1. 销售（sales_test1）登录 3000 端口
2. 进入客资 L-091 详情
3. 点击"标记成交"
4. 填写成交信息，提交
5. 记录提交时间 T1

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | `notifications` 表新增 type_code='lead_deal_done'，receiver_id=owner_test1.id | SQL 查询 |
| 3001 端口 WebSocket | owner_test1 在 T1 + 3 秒内收到 `notification.created` 事件 | 网络抓包 |
| 3001 端口 UI | owner_test1 消息中心显示新通知 | UI 截图 |
| 跨端口 namespace | 通知通过跨端口路由（不依赖单一 3000 端口 WS） | 抓包分析 |

**实际结果：** （留空）

**备注：**
- 跨端口 namespace 路由是 v1.2 关注点
- 验证消息不重复发送（不同时给 3000 端口的 supervisor）

---

#### TC-NOT-092：3000 端口客资积压→3001 端口老板判断卡红点

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_overdue_alert`（自动巡检） |
| 触发场景 | @Cron 扫描客资积压 |
| 接收端 | 3001 端口 owner_test1 |
| 优先级 | **P0** |
| 缺口追溯 | 总后台老板判断卡 |

**前置条件：**
1. 3000 端口有 20 条 status='new' 且超过 2 小时未分配
2. owner_test1 在 3001 端口已登录

**测试步骤：**

1. 等待 @Cron 扫描（30 分钟一次）或手动触发
2. owner_test1 在 3001 端口总后台首页
3. 查看顶部老板判断卡

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 红点显示 | "客资积压"红色徽标显示数字 20 | UI 截图 |
| 数字准确性 | 与 DB count(*) 一致 | SQL 验证 |
| 自动更新 | 数字每 30 分钟自动刷新（或手动刷新） | 时间戳 |

**实际结果：** （留空）

**备注：**
- 老板判断卡红点是 P0 需求

---

#### TC-NOT-093：主管批量改派 50 条客资→50 个销售各收到 1 条

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_assigned` × 50 |
| 触发场景 | 主管批量改派 50 条客资给 sales_test2 |
| 接收端 | sales_test2 |
| 优先级 | **P0** |
| 缺口追溯 | 批量通知正确性 |

**前置条件：**
1. 50 条客资已被选中
2. supervisor_test1 改派给 sales_test2

**测试步骤：**

1. supervisor_test1 批量改派
2. sales_test2 监控 WebSocket 事件

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | sales_test2 收到 50 条 lead_assigned（每客资 1 条） | DB count |
| 推送顺序 | 按 leadId 升序或完成时间升序 | 抓包 |
| 推送间隔 | 每 100ms 一条，避免 1 次推送 50 条阻塞 | 抓包时间差 |
| 通知内容 | 每条 content 包含对应客资的 lead_code | 解析 payload |

**实际结果：** （留空）

**备注：**
- 真实缺陷 BF-15 回归：PUT 改 assignedSalesUserId 也必须触发通知
- 验证事务一致性：50 条要么全部成功，要么全部失败

---

#### TC-NOT-094：批量改派的去重（同一客资不重复通知）

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_assigned` |
| 触发场景 | 同一客资 5 秒内被改派 2 次给同一销售 |
| 接收端 | sales_test2 |
| 优先级 | **P0** |
| 缺口追溯 | 防重机制 |

**前置条件：**
1. 客资 L-094 当前 sales=NULL
2. sales_test2 在线

**测试步骤：**

1. supervisor_test1 改派 L-094 给 sales_test2（T1）
2. 1 秒后再次改派 L-094 给 sales_test2（T2）

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知数量 | sales_test2 只收到 1 条 lead_assigned（不是 2 条） | DB count |
| 去重机制 | 同一 receiver_id + related_id + type_code 在 60 秒窗口内去重 | SQL 查询 |
| 通知内容 | 包含最新改派时间 | payload |

**实际结果：** （留空）

**备注：**
- 防止 UI 抖动和销售误操作
- 验证后端去重逻辑（Redis SET 或 DB 唯一索引）

---

#### TC-NOT-095：通知保留 90 天 / 180 天策略

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 90 天前的通知是否仍可查 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 数据保留策略 |

**前置条件：**
1. 数据库有 100 天前创建的通知
2. 100 天前的通知有 read_status='read'

**测试步骤：**

1. supervisor_test1 GET /api/notifications?from=2026-01-01
2. 验证返回

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 保留期 | 90 天内的通知全部可查 | DB count |
| 过期清理 | 90 天前的通知**已清理**或标记 archived | SQL 查询 |
| 归档查询 | 归档通知通过 GET /api/notifications/archive 可查（如果有） | API 验证 |

**实际结果：** （留空）

**备注：**
- v1.2 文档应明确保留期

---

#### TC-NOT-096：过期通知清理任务

| 字段 | 内容 |
|------|------|
| 通知类型 | 自动清理 |
| 触发场景 | @Cron 每日清理过期通知 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | 自动任务 |

**前置条件：**
1. 数据库有 100 天前的通知
2. @Cron 已配置

**测试步骤：**

1. 等待 @Cron 触发或手动触发
2. 验证清理结果

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 清理时间 | 每日凌晨 3:00 | cron 配置 |
| 清理数量 | 100 天前通知全部删除或归档 | DB count |
| 保留规则 | 重要通知（如 lead_assigned、order_created）保留更长（180 天） | SQL 查询 |

**实际结果：** （留空）

**备注：**
- 区分系统消息（短期）和业务消息（长期）

---

#### TC-NOT-097：业务消息 vs 系统消息分组

| 字段 | 内容 |
|------|------|
| 通知类型 | 业务（lead_*/order_*） vs 系统（export_finished、system_announcement） |
| 触发场景 | 不同类型通知的展示分组 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 消息中心分组 |

**前置条件：**
1. 系统已有 5 条业务消息、3 条系统消息

**测试步骤：**

1. supervisor_test1 进入消息中心
2. 查看分组 Tab

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Tab 分组 | "业务"Tab 和"系统"Tab 分开 | UI |
| 业务消息 | lead_assigned、order_created 等 | type_code 前缀 |
| 系统消息 | export_finished、system_announcement、import_finished | type_code 前缀 |
| 未读数 | 每个 Tab 独立未读数 | API |

**实际结果：** （留空）

**备注：**
- 用户体验优化

---

#### TC-NOT-098：管理员系统消息开关

| 字段 | 内容 |
|------|------|
| 通知类型 | 系统消息 |
| 触发场景 | 管理员关闭某类系统消息 |
| 接收端 | 所有用户 |
| 优先级 | **P1** |
| 缺口追溯 | 消息偏好设置 |

**前置条件：**
1. admin_test1 有系统消息管理权限

**测试步骤：**

1. admin_test1 进入"系统设置" → "通知开关"
2. 关闭"导出完成"通知
3. 某用户创建导出任务
4. 验证该用户**不**收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 开关生效 | 关闭后该类型通知不再生成 | DB count |
| 全员生效 | 所有用户都不再收到 | 多用户验证 |
| UI 反馈 | 开关状态明确显示 | 截图 |

**实际结果：** （留空）

**备注：**
- 可选功能

---

#### TC-NOT-099：销售点击"撤回协同"→运营收到协同撤回通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_withdrawn` |
| 触发场景 | 销售在运营处理前撤回协同 |
| 接收端 | 运营 |
| 优先级 | **P1** |
| 缺口追溯 | 协同撤回 |

**前置条件：**
1. 销售 sales_test1 已发起协同 CT-099
2. 运营未处理（status='pending'）

**测试步骤：**

1. sales_test1 在协同详情点击"撤回"
2. 验证运营收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 撤回成功 | 协同 status='withdrawn' | SQL |
| 通知 | operation_test1 收到 `collaboration_withdrawn` | 抓包 |
| 撤回原因 | 通知 content 包含撤回原因 | payload |

**实际结果：** （留空）

**备注：**
- 可选功能

---

#### TC-NOT-100：运营主动关闭协同→销售收到运营主动关闭通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_closed_by_handler` |
| 触发场景 | 运营主动关闭协同（拒绝处理） |
| 接收端 | 销售 |
| 优先级 | **P0** |
| 缺口追溯 | 协同主动关闭 |

**前置条件：**
1. 协同 CT-100 status='pending' 或 'handling'
2. operation_test1 主动关闭

**测试步骤：**

1. operation_test1 在协同详情点击"主动关闭"
2. 填写关闭原因
3. sales_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 关闭成功 | CT-100 status='closed' | SQL |
| 通知 | sales_test1 收到 `collaboration_closed_by_handler` | 抓包 |
| 关闭原因 | 通知 content 包含运营填写的关闭原因 | payload |

**实际结果：** （留空）

**备注：**
- 重要通知

---

### 11.2 通知状态确认 P0 缺口

#### TC-NOT-101：销售成交→主管是否真的不收到 lead_deal_done 通知（如果仍下线）

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_deal_done` |
| 触发场景 | 销售成交 |
| 接收端 | 主管（3000 端口的 supervisor） |
| 优先级 | **P0** |
| 缺口追溯 | N-06 通知"已下线" |

**前置条件：**
1. supervisor_test1 在 3000 端口登录
2. 客资 L-101 added_success

**测试步骤：**

1. sales_test1 标记成交
2. supervisor_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 不收到 lead_deal_done | supervisor_test1 **不**收到 lead_deal_done 通知（如果下线） | DB count |
| 替代通知 | supervisor_test1 仍能通过其他渠道感知（如订单汇总、看板） | UI |
| 总后台 3001 | owner_test1 仍收到（跨端口推送） | TC-NOT-091 验证 |

**实际结果：** （留空）

**备注：**
- "下线"指 3000 端口的 supervisor 不再触发 lead_deal_done
- 3001 端口的 owner 仍可收到

---

#### TC-NOT-102：销售成交→教务是否收到 order_created（不应该是 lead_deal_done）

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_created` |
| 触发场景 | 销售成交 |
| 接收端 | 教务 |
| 优先级 | **P0** |
| 缺口追溯 | 通知 type 准确性 |

**前置条件：**
1. sales_test1 成交
2. academic_test1 在线

**测试步骤：**

1. sales_test1 标记成交
2. academic_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知类型 | academic_test1 收到 type='order_created'（不是 lead_deal_done） | payload.typeCode |
| 订单信息 | content 包含订单编号、客户、金额 | payload.content |

**实际结果：** （留空）

**备注：**
- 防止通知类型错误

---

#### TC-NOT-103：主管填写建议→运营端是否收到 supervisor_suggestion 通知

| 字段 | 内容 |
|------|------|
| 通知类型 | `supervisor_suggestion` |
| 触发场景 | 主管填写建议 |
| 接收端 | 运营 |
| 优先级 | **P0** |
| 缺口追溯 | N-11 通知"已下线" |

**前置条件：**
1. supervisor_test1 在线
2. 运营 operation_test1 有作品 P-103

**测试步骤：**

1. supervisor_test1 给 P-103 写建议
2. operation_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 收到通知 | operation_test1 收到 type='supervisor_suggestion' | payload |
| 通知内容 | 包含建议全文（如果有截断 100 字+"查看更多"） | payload.content |

**实际结果：** （留空）

**备注：**
- N-11 在 v1.2 重新启用

---

#### TC-NOT-104：若下线，主管建议如何触达员工

| 字段 | 内容 |
|------|------|
| 通知类型 | 替代渠道 |
| 触发场景 | 主管建议已下线 |
| 接收端 | 运营 |
| 优先级 | **P1** |
| 缺口追溯 | 触达机制设计 |

**前置条件：**
1. supervisor_suggestion 通知下线
2. 主管已写建议

**测试步骤：**

1. 运营 operation_test1 进入"个人看板"
2. 查找"主管建议"区

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 看板显示 | 主管建议直接显示在个人看板 | UI |
| 邮件/IM 触达 | 是否有邮件/IM 推送（如果有） | 配置验证 |

**实际结果：** （留空）

**备注：**
- 仅当通知下线时验证

---

#### TC-NOT-105：每种通知的 routeHint 完整且正确（跨端跳转目标正确）

| 字段 | 内容 |
|------|------|
| 通知类型 | 全部 12 种 |
| 触发场景 | 通知创建 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 跳转路径完整性 |

**前置条件：**
1. 12 种通知全部测试

**测试步骤：**

1. 依次触发 12 种通知
2. 验证每种通知的 routeHint 字段

**预期结果：**

| 通知类型 | routeHint |
|---------|-----------|
| lead_assigned | `/sales/leads/{leadId}` |
| collaboration_requested | `/operation/collaboration?taskId={taskId}` |
| customer_not_passed | `/operation/leads/{leadId}` |
| collaboration_handled | `/sales/leads/{leadId}` |
| customer_added | `/operation/leads/{leadId}` |
| lead_deal_done | `/owner/leads/{leadId}`（跨端口） |
| order_created | `/academic/orders/{orderId}` |
| order_updated | `/sales/orders/{orderId}` |
| order_abnormal | `/sales/orders/{orderId}` |
| export_finished | `/exports/{exportId}/download` |
| supervisor_suggestion | `/operation/posts/{postId}` |
| collaboration_timeout | `/supervisor/collaboration` |

**实际结果：** （留空）

**备注：**
- routeHint 是 P0 关键字段

---

#### TC-NOT-106：routeHint 异常时的回退路径

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | routeHint 字段缺失或格式错误 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 通知健壮性 |

**前置条件：**
1. 通知数据中 routeHint=null

**测试步骤：**

1. 收到通知
2. 点击通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 回退路径 | 跳转到消息中心或对应模块首页（不报错） | UI |
| 不崩溃 | 浏览器不报错、不白屏 | 控制台 |
| 友好提示 | 提示"该通知无法跳转"（如有） | UI |

**实际结果：** （留空）

**备注：**
- 防止通知成为死链

---

#### TC-NOT-107：单条通知删除操作（如果允许）

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 用户删除单条通知 |
| 接收端 | 任意 |
| 优先级 | **P1** |
| 缺口追溯 | 通知生命周期 |

**前置条件：**
1. 用户有 5 条通知

**测试步骤：**

1. 用户选中 1 条通知
2. 点击"删除"
3. 验证

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 软删除 | notifications 表该记录 is_deleted=true（不物理删除） | SQL |
| UI 移除 | 列表不再显示 | UI |
| 未读数 | 未读数 -1 | API |

**实际结果：** （留空）

**备注：**
- 可选功能

---

#### TC-NOT-108：30 天后通知自动归档

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 30 天前已读通知 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | 自动归档 |

**前置条件：**
1. 30 天前的已读通知

**测试步骤：**

1. 等待 @Cron 自动归档
2. 验证归档结果

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 归档状态 | 30 天前已读通知 is_archived=true | SQL |
| 主列表不显示 | /api/notifications 默认查询过滤 is_archived | API |
| 归档列表 | /api/notifications?archive=true 可查 | API |

**实际结果：** （留空）

**备注：**
- 减少主列表数据量

---

#### TC-NOT-109：主管发布系统公告→全体员工/销售/教务都收到

| 字段 | 内容 |
|------|------|
| 通知类型 | `system_announcement` |
| 触发场景 | 主管发布系统公告 |
| 接收端 | 全员 |
| 优先级 | **P0** |
| 缺口追溯 | 广播通知 |

**前置条件：**
1. supervisor_test1 有系统公告权限
2. 系统有 10 个用户

**测试步骤：**

1. supervisor_test1 发布公告"系统维护通知 2026-06-15"
2. 验证全员收到

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 接收人 | 10 个用户全部收到 | DB count |
| 通知 type | type_code='system_announcement' | SQL |
| 通知 content | 公告全文（不超过 200 字） | payload |
| 重要级别 | 可置顶显示 | UI |

**实际结果：** （留空）

**备注：**
- 重要通知

---

#### TC-NOT-110：异常升级通知（教务升级订单异常给主管→主管立即收到）

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_abnormal_escalated` |
| 触发场景 | 教务升级订单异常 |
| 接收端 | 主管 |
| 优先级 | **P0** |
| 缺口追溯 | 异常升级 |

**前置条件：**
1. 订单 O-110 有异常反馈
2. academic_test1 升级该异常

**测试步骤：**

1. academic_test1 点击"升级到主管"
2. supervisor_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 升级通知 | supervisor_test1 收到 type='order_abnormal_escalated' | 抓包 |
| 通知内容 | 包含订单号、异常类型、升级原因 | payload |
| 优先级 | 高优先级，UI 突出显示 | UI |

**实际结果：** （留空）

**备注：**
- 紧急通知

---

#### TC-NOT-111：跟进备注 2000 字 → 通知 content 截断到 100 字 + "查看更多"

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_followed` |
| 触发场景 | 销售提交 2000 字跟进备注 |
| 接收端 | 运营 |
| 优先级 | **P0** |
| 缺口追溯 | 长文本截断 |

**前置条件：**
1. sales_test1 有客资
2. 跟进备注 2000 字

**测试步骤：**

1. sales_test1 提交 2000 字跟进
2. operation_test1 收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 截断 | notification.content 显示前 100 字 + "...查看更多" | payload |
| 点击"查看更多" | 跳转客资详情查看完整 2000 字 | UI |
| 不截断在中间 | 截断位置不是 emoji 或中文字符中间 | 验证 |

**实际结果：** （留空）

**备注：**
- 防止通知过长

---

#### TC-NOT-112：协同 reason 1000 字 → 通知 content 截断

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_requested` |
| 触发场景 | 销售提交 1000 字协同 reason |
| 接收端 | 运营 |
| 优先级 | **P0** |
| 缺口追溯 | 长文本截断 |
| **缺陷回归** | **PF-04**：中文字符不应报 422 |

**前置条件：**
1. 协同 reason="客户已多次未通过好友申请..."1000 字

**测试步骤：**

1. sales_test1 提交协同（reason 1000 字）
2. operation_test1 收到通知

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 不报 422 | reason 包含中文应**正常**保存（PF-04 回归） | API |
| 截断 | 通知 content 显示前 100 字 + "...查看更多" | payload |

**实际结果：** （留空）

**备注：**
- **真实执行已发现严重缺陷回归 PF-04**

---

#### TC-NOT-113：未读数接口是否走 Redis 缓存

| 字段 | 内容 |
|------|------|
| 通知类型 | N/A |
| 触发场景 | 频繁轮询未读数 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | v1.2 Redis 适配 |

**前置条件：**
1. Redis 服务运行

**测试步骤：**

1. 用户连续 10 次调用 GET /api/notifications/unread-count
2. 测量响应时间
3. 验证 Redis 命中

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Redis 缓存 | 第一次查 DB，后续 9 次走 Redis | Redis 监控 |
| 响应时间 | 缓存命中 < 50ms | 计时 |
| 实时性 | 通知创建后未读数 +1（缓存失效） | 业务验证 |

**实际结果：** （留空）

**备注：**
- 性能优化

---

#### TC-NOT-114：未读数准确性（DB 与 Badge 同步）

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 用户操作（已读/删除） |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | 数据一致性 |

**前置条件：**
1. 用户有 5 条未读

**测试步骤：**

1. 用户标记 1 条已读
2. UI Badge 显示
3. GET /api/notifications/unread-count
4. 对比

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| UI Badge | 显示 4 | UI |
| API | 返回 4 | API |
| DB | `COUNT(*)` 满足 read_status=false | SQL |

**实际结果：** （留空）

**备注：**
- 一致性是 P0

---

#### TC-NOT-115：协同超时通知 content 包含"已超时 X 小时"

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout` |
| 触发场景 | @Cron 扫描超时任务 |
| 接收端 | 主管 |
| 优先级 | **P0** |
| 缺口追溯 | 超时时长展示 |

**前置条件：**
1. 协同 CT-115 pending 超过 1 小时

**测试步骤：**

1. 等待 @Cron 扫描
2. supervisor_test1 检查消息中心

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 通知生成 | 收到 type='collaboration_timeout' | payload |
| Content | "协同任务已超时 1 小时 30 分，请尽快处理" | payload.content |
| 关联信息 | 包含客资 lead_code、运营姓名 | payload |

**实际结果：** （留空）

**备注：**
- 用户体验

---

#### TC-NOT-116：超时通知发送对象（运营+主管+销售，参考 v1.2 fixture 中是 admin+ops）

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout` |
| 触发场景 | 超时扫描 |
| 接收端 | 运营+主管（销售？） |
| 优先级 | **P0** |
| 缺口追溯 | 超时通知接收人 |

**前置条件：**
1. 协同超时
2. v1.2 fixture 中通知发给 admin+ops

**测试步骤：**

1. 协同超时
2. 检查多端接收

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 运营收到 | operation_test1 收到 | DB count |
| 主管收到 | supervisor_test1 收到 | DB count |
| 销售收到 | sales_test1 收到（如实现） | DB count |

**实际结果：** （留空）

**备注：**
- 验证 v1.2 fixture 行为

---

#### TC-NOT-117：3000 端口协同超时 → 3001 owner 端是否收到

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout`（跨端口） |
| 触发场景 | 协同超时 |
| 接收端 | 3001 owner |
| 优先级 | **P0** |
| 缺口追溯 | 跨端口通知 |

**前置条件：**
1. 3000 端口协同超时
2. owner_test1 在 3001 端口登录

**测试步骤：**

1. 等待 @Cron
2. owner_test1 检查

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 跨端口推送 | owner_test1 收到通知 | 抓包 |
| 跨 namespace | 3001 namespace 收到 | 抓包 |
| 内容一致 | 与 3000 端口通知内容一致 | 对比 |

**实际结果：** （留空）

**备注：**
- 跨端口通知链路

---

#### TC-NOT-118：3001 端是否能处理协同超时（如果能）

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout` |
| 触发场景 | 3001 端处理 |
| 接收端 | 3001 owner |
| 优先级 | **P0** |
| 缺口追溯 | 跨端口处理 |

**前置条件：**
1. owner_test1 在 3001 端收到协同超时通知
2. owner_test1 点击通知

**测试步骤：**

1. owner_test1 点击超时通知
2. 验证跳转和处理

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 跳转 | 跳转到 3001 端协同详情页（只读）或重定向到 3000 端口 | UI |
| 处理能力 | owner 能在 3001 端强制关闭协同（如果有权限） | API |
| 或重定向 | 提示"请到 3000 端口处理" | UI |

**实际结果：** （留空）

**备注：**
- 跨端口处理能力

---

#### TC-NOT-119：英文环境下通知 title 是英文

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 用户切换语言 |
| 接收端 | 任意 |
| 优先级 | **P1** |
| 缺口追溯 | 国际化 |

**前置条件：**
1. 系统支持英文（i18n）

**测试步骤：**

1. 用户切换语言为英文
2. 触发通知
3. 验证 title

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 英文 title | "New Lead Assigned" | payload.title |
| 英文 content | "You have a new lead..." | payload.content |
| 不混用 | 不出现中文字符 | 验证 |

**实际结果：** （留空）

**备注：**
- 可选功能

---

#### TC-NOT-120：紧急通知（订单异常）有特殊 Toast/声音/震动

| 字段 | 内容 |
|------|------|
| 通知类型 | `order_abnormal` |
| 触发场景 | 订单异常 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 通知视觉/听觉 |

**前置条件：**
1. 用户在线
2. 浏览器开启通知权限

**测试步骤：**

1. 订单异常触发
2. 用户观察 Toast

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| Toast | 屏幕中央显示红色 Toast 5 秒 | UI |
| 声音 | 播放"叮"警告音（如启用） | 听觉 |
| 震动 | 移动端震动（如启用） | 触觉 |
| 浏览器 PUSH | 浏览器原生 PUSH 通知 | 系统通知 |

**实际结果：** （留空）

**备注：**
- 重要通知

---

#### TC-NOT-121：普通通知（导出完成）静默更新 Badge

| 字段 | 内容 |
|------|------|
| 通知类型 | `export_finished` |
| 触发场景 | 导出完成 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 通知级别区分 |

**前置条件：**
1. 用户导出中

**测试步骤：**

1. 导出完成
2. 用户观察

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 不弹 Toast | 屏幕不弹 Toast | UI |
| Badge 变化 | 顶部未读数 +1 | UI |
| 可静默 | 不打扰用户 | 行为 |

**实际结果：** （留空）

**备注：**
- 普通通知

---

#### TC-NOT-122：销售已读 lead_assigned 后，运营端能否看到"销售已读"

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_assigned` |
| 触发场景 | 销售已读 |
| 接收端 | 运营 |
| 优先级 | **P1** |
| 缺口追溯 | 通知回执 |

**前置条件：**
1. sales_test1 收到 lead_assigned
2. sales_test1 标记已读

**测试步骤：**

1. sales_test1 在消息中心标记已读
2. operation_test1 能否看到已读状态

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 销售已读 | 运营端销售分配列表显示"销售已读"标记 | UI |
| 或仅后台 | 销售已读状态仅后台记录，UI 不展示 | UI |

**实际结果：** （留空）

**备注：**
- 可选功能

---

#### TC-NOT-123：销售端关闭浏览器 → 新通知到来 → 浏览器 PUSH 通知

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 浏览器关闭 |
| 接收端 | 任意 |
| 优先级 | **P0** |
| 缺口追溯 | 离线 PUSH |

**前置条件：**
1. 销售浏览器开启 PUSH 权限

**测试步骤：**

1. sales_test1 关闭浏览器
2. 运营分配客资
3. 验证 PUSH

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| PUSH 通知 | 操作系统显示 PUSH 通知 | 系统 |
| 点击跳转 | 点击 PUSH 打开浏览器并跳转到客资详情 | UI |
| 权限 | 用户可关闭 PUSH 权限 | 浏览器设置 |

**实际结果：** （留空）

**备注：**
- Service Worker + Notification API

---

#### TC-NOT-124：销售成交后通知给运营端，运营端跳转的是"已成交客资"详情页

| 字段 | 内容 |
|------|------|
| 通知类型 | `lead_deal_done` 或 `customer_added` |
| 触发场景 | 销售成交 |
| 接收端 | 运营 |
| 优先级 | **P0** |
| 缺口追溯 | 跳转目标 |

**前置条件：**
1. sales_test1 成交
2. operation_test1 收到通知

**测试步骤：**

1. operation_test1 点击通知
2. 验证跳转

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 跳转目标 | 跳转到客资详情页，状态显示"已成交" | UI |
| 不是列表 | 跳转到详情而非列表 | 路径 |
| routeHint 正确 | routeHint 包含 leadId | payload |

**实际结果：** （留空）

**备注：**
- 跳转准确性

---

#### TC-NOT-125：3001 端口 owner 端能否接收 WebSocket 推送

| 字段 | 内容 |
|------|------|
| 通知类型 | 跨端口推送 |
| 触发场景 | owner 在 3001 端登录 |
| 接收端 | 3001 owner |
| 优先级 | **P0** |
| 缺口追溯 | 跨端口 WS |

**前置条件：**
1. owner_test1 在 3001 端口登录

**测试步骤：**

1. owner_test1 保持 3001 端口打开
2. 触发跨端口通知（3000 端成交）
3. 验证推送

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| WS 连接 | 3001 端口 /notifications namespace 已连接 | 抓包 |
| 推送 | owner 收到推送 | 抓包 |
| 跨域 | 3000→3001 通过跨端口路由（不是 3000 端 WS） | 抓包 |

**实际结果：** （留空）

**备注：**
- 跨端口 WS 架构

---

#### TC-NOT-126：3001 端口的 NotificationContext 独立

| 字段 | 内容 |
|------|------|
| 通知类型 | 任意 |
| 触发场景 | 3000 端口通知 |
| 接收端 | 3001 owner |
| 优先级 | **P0** |
| 缺口追溯 | 通知上下文隔离 |

**前置条件：**
1. owner_test1 在 3001 端口
2. sales_test1 在 3000 端口

**测试步骤：**

1. 销售分配客资（3000 端操作）
2. 验证 3001 端口 owner 端
3. 验证 3000 端口 sales 端

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| sales_test1 收到 | 3000 端口 sales 收到 lead_assigned | DB |
| owner_test1 不收到 | 3001 端口 owner **不**收到 lead_assigned | DB count |
| 跨端口不重复 | 不出现 sales 收到 2 次的情况 | DB count |

**实际结果：** （留空）

**备注：**
- namespace 隔离

---

### 11.3 Redis 适配 v1.2 状态机回归

> **来源**：`doc/v1.2-b端-redis适配说明.md`
> **本章范围**：Redis 不可用时的降级、状态一致性

#### TC-NOT-127：协同关闭状态在 Redis 中的状态一致性

| 字段 | 内容 |
|------|------|
| 通知类型 | N/A |
| 触发场景 | 协同关闭 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | v1.2 Redis 适配 |

**前置条件：**
1. Redis 运行
2. 协同 CT-127 status='pending'

**测试步骤：**

1. 运营关闭协同
2. 验证 Redis 与 DB 一致性

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| DB 状态 | collaboration_tasks.status='closed' | SQL |
| Redis 状态 | Redis key 'collab:{id}:status' = 'closed' | Redis CLI |
| 一致 | DB 与 Redis 一致 | 对比 |

**实际结果：** （留空）

**备注：**
- 状态机一致性

---

#### TC-NOT-128：Redis 重启后状态恢复

| 字段 | 内容 |
|------|------|
| 通知类型 | N/A |
| 触发场景 | Redis 重启 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | 持久化 |

**前置条件：**
1. Redis 启用 AOF 或 RDB 持久化
2. Redis 中有 10 个协同状态 key

**测试步骤：**

1. 记录 Redis 重启前状态
2. 重启 Redis
3. 验证状态恢复

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 数据持久化 | 重启后 10 个 key 全部恢复 | Redis CLI |
| 准确性 | key 值与重启前一致 | 对比 |
| 不依赖 Redis 启动 | 业务不阻塞 | 业务验证 |

**实际结果：** （留空）

**备注：**
- AOF 比 RDB 更实时

---

#### TC-NOT-129：BullMQ 队列在 Redis 不可用时的降级

| 字段 | 内容 |
|------|------|
| 通知类型 | N/A |
| 触发场景 | Redis 不可用 |
| 接收端 | N/A |
| 优先级 | **P0** |
| 缺口追溯 | 降级机制 |

**前置条件：**
1. BullMQ 队列依赖 Redis
2. Redis 服务停止

**测试步骤：**

1. 停止 Redis
2. 尝试创建导出任务
3. 验证降级

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 不崩溃 | 业务不崩溃 | 进程存活 |
| 友好提示 | 提示"导出功能暂时不可用" | UI |
| 队列降级 | 任务进入内存队列或本地存储 | 内部状态 |
| Redis 恢复 | Redis 恢复后任务自动执行 | 业务验证 |

**实际结果：** （留空）

**备注：**
- 降级机制是 P0

---

#### TC-NOT-130：协同超时扫描器 @Cron 在 Redis 不可用时的降级

| 字段 | 内容 |
|------|------|
| 通知类型 | `collaboration_timeout` |
| 触发场景 | Redis 不可用 |
| 接收端 | 主管 |
| 优先级 | **P0** |
| 缺口追溯 | @Cron 降级 |

**前置条件：**
1. @Cron 扫描器配置
2. Redis 停止

**测试步骤：**

1. 停止 Redis
2. 等待 @Cron 触发
3. 验证降级

**预期结果：**

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 扫描继续 | @Cron 仍能执行 DB 扫描 | 日志 |
| 通知发送 | 超时通知通过 DB 轮询等其他方式触达 | DB 验证 |
| 不丢失 | 不漏扫协同任务 | DB count |

**实际结果：** （留空）

**备注：**
- @Cron 不应强依赖 Redis

---

## 附录A：测试用例统计（v1.2 P0/P1 追加）

| 类别 | 用例数量 |
| --- | --- |
| 第十一章 跨端口 3001 缺口 | 40 |
| Redis 适配 v1.2 | 4 |
| **总计（本批追加）** | **44** |

---

**文档结束**
