# 通知与 WebSocket 专项测试用例

> 文档生成时间：2026-06-03
> 依据：
> - `doc/运营中台四端口.md` §8.4 提醒类型 / §10 WebSocket 事件 / §11 性能
> - `doc/B端-v1.2-通知和WebSocket测试用例.md`（v1.2 实际 12 个 type_code）
> - `doc/B端-P1修复-通知1-5.md` + `B端-P1修复-通知6-10.md`（通知 1-10 修复）
> - `doc/v1.2-b端-redis适配说明.md`（Redis 性能 / 60s 轮询兜底）
> - `doc/test-cases/07-通知和WebSocket测试用例.md`（TC-NOT-xxx 风格）
> - `doc/test-cases/09-总后台测试用例.md`（3001 端口 WebSocket 命名空间）
> 用途：补 07-通知和WebSocket测试用例.md 中缺失的 12 个通知类型逐个验证、routeHint 端到端、离线/重连/多端、通知合并/去重、3001 端口 WebSocket 独立命名空间等关键缺口。
> 范围：通知类型端到端 + 通知 routeHint 端到端 + 离线补拉/断线重连/多端 + 通知合并去重 + 3001 WebSocket 命名空间。
> 编号体系：
> - `TC-N12-xxx`：12 个通知类型逐个验证（A1）
> - `TC-RH-xxx`：routeHint 端到端（A2）
> - `TC-OFFL-xxx`：离线补拉/断线重连/多端登录（A3）
> - `TC-MRG-xxx`：通知合并/去重/优先级（A4）
> - `TC-OWNS-xxx`：3001 端口 WebSocket 独立命名空间（A5）

---

## 一、覆盖总览

| 章节 | 主题 | 用例数 | 优先级分布 |
|------|------|--------|------------|
| A1 通知 12 类型逐个验证 | TC-N12-001 ~ TC-N12-012 | 12 | P0: 12 |
| A2 通知 routeHint 端到端 | TC-RH-001 ~ TC-RH-015 | 15 | P0: 12, P1: 2, P2: 1 |
| A3 离线补拉/断线重连/多端登录 | TC-OFFL-001 ~ TC-OFFL-010 | 10 | P0: 8, P1: 2 |
| A4 通知合并/去重/优先级 | TC-MRG-001 ~ TC-MRG-010 | 10 | P0: 6, P1: 3, P2: 1 |
| A5 3001 端口 WebSocket 独立命名空间 | TC-OWNS-001 ~ TC-OWNS-010 | 10 | P0: 8, P1: 2 |
| **总计** | — | **57** | P0: 46, P1: 9, P2: 2 |

> 命名空间说明：本文件中所有 3000 端口的 socket 命名空间指 `/notifications`（见 `notifications.gateway.ts`）；3001 端口的 socket 命名空间根据 `TC-OWNS-001` 验证结果而定，期望为 `/owner` 或 `/notifications` 但与 3000 隔离（视实际实现而定，本文件基于 `09-总后台测试用例.md §8.1` 推断为独立命名空间）。

---

## 二、专项 A1：通知 12 类型逐个验证

> 覆盖 v1.2 实际落库的 12 个 type_code（依据 `B端-v1.2-通知和WebSocket测试用例.md §0.1`）：
> `lead_assigned` / `lead_source_confirmed` / `collaboration_requested` / `collaboration_handled` / `collaboration_timeout` / `customer_added` / `customer_not_passed` / `deal_closed`（或 v1.2 拆分的 `order_created`/`order_handed_over`/`order_accepted`）/ `order_node_due` / `order_abnormal` / `import_done` / `export_done`。
>
> 每条用例关注：触发源 / 接收方 / DB 行 / socket 事件 / 前端渲染 五层端到端，并明确性能指标（DB 写入 + emit 总延迟 < 3s）。

### TC-N12-001：N-01 `lead_assigned` 含运营创建 + 主管改派两条路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-001 |
| **用例标题** | N-01 `lead_assigned` 含运营创建 + 主管改派两条路径 |
| **触发源** | 路径 A：运营 `POST /api/leads` 带 `assignedSalesUserId`；路径 B：主管 `PUT /api/leads/:id` 带 `assignedSalesUserId`（改派） |
| **接收方** | `assignedSalesUserId` 销售（路径 A 直接分配；路径 B 改派给新销售） |
| **优先级** | P0 |
| **关联需求** | `运营中台四端口.md §8.4` 销售提醒 - 新分配客资 / `B端-v1.2-通知和WebSocket测试用例.md TC-NOT-001+TC-NOT-002` |
| **性能指标** | HTTP 响应 < 1s；DB INSERT + socket emit 总延迟 < 3s（p95） |
| **关联源码** | `leads.service.ts:289-301`（create）、`leads.controller.ts:355-371`（改派） |

**前置数据**：
- 销售甲 `USR_SALES_A` 在线（socket 已连）；主管丁 `USR_ADMIN_D` 在线
- 客资 `LEAD_NEW_1` 不存在（路径 A）；客资 `LEAD_SALES_B_1`（`assigned_sales_user_id=USR_SALES_B`，路径 B 用）

**测试步骤**：
1. 路径 A：运营甲登录，调 `POST /api/leads`，body：`{contactInfo:"13800000001", nickname:"测试客户A", platform:"小红书", assignedSalesUserId:"USR_SALES_A", sourceEmployeeId:"EMP_OPS_A"}`，记录提交时间 T1
2. 销售甲前端 socket 监听 `notification.created` + `lead.assigned` 事件
3. 路径 B：主管丁登录，调 `PUT /api/leads/LEAD_SALES_B_1`，body：`{assignedSalesUserId:"USR_SALES_A"}`，记录提交时间 T2
4. 销售甲前端 socket 监听改派通知

**预期结果**：

| 检查点 | 预期值 | 验证方式 |
|--------|--------|----------|
| 路径 A HTTP | 200，返 `{ok:true, lead:{...}}` | API 响应 |
| 路径 A DB | `notifications` 新增 1 行 `type_code='lead_assigned'`, `receiver_id='USR_SALES_A'`, `port_type='sales'`, `related_id='LEAD_NEW_1'`, `read_status=0` | SQL 查询 |
| 路径 A socket | 销售甲在 T1 + 3s 内收到 `notification.created`（payload 含 `typeCode='lead_assigned'`, `routeHint='/sales/leads/LEAD_NEW_1'`） | DevTools / socket.io-client 脚本 |
| 路径 B HTTP | 200，返 `{ok:true}` | API 响应 |
| 路径 B DB | 销售甲收 1 条 `lead_assigned`，`title='客资已改派给您'`，`content` 含 `从 USR_SALES_B 改派给您` | SQL 查询（`content LIKE '%改派%'`） |
| 路径 B socket | 销售甲在 T2 + 3s 内收到 `lead.assigned` 事件 | DevTools 抓包 |
| 铃铛红点 | 路径 A + 路径 B 累计 +2（多 tab 各自 +1） | UI Badge 断言 |
| 越权 | 销售乙不收任何一条 | SQL 过滤 `receiver_id='USR_SALES_B'` |

**DB 核对 SQL**：
```sql
-- 路径 A 通知
SELECT id, receiver_id, type_code, port_type, related_id, related_type, read_status
FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='lead_assigned'
ORDER BY created_at DESC LIMIT 1;

-- 路径 B 改派通知
SELECT id, receiver_id, title, content
FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='lead_assigned' AND content LIKE '%改派%'
ORDER BY created_at DESC LIMIT 1;
```

**潜在缺陷回归**：`BF-15` 改派未发通知（已修复于 v1.2 改派路径）— 需验证 `leads.controller.ts:355-371` 确实调用了 `notificationsService.create`。

---

### TC-N12-002：N-02 `lead_source_confirmed`（v1.2 新增，运营 confirmSource 路径）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-002 |
| **用例标题** | N-02 `lead_source_confirmed`（v1.2 新增，运营 confirmSource 路径） |
| **触发源** | 运营 `PUT /api/leads/:id/confirm-source` |
| **接收方** | `assignedSalesUserId` 销售 |
| **优先级** | P0 |
| **关联需求** | `B端-v1.2-通知和WebSocket测试用例.md TC-NOT-003` |
| **性能指标** | HTTP < 1s；socket 推送 < 3s（p95） |
| **关联源码** | `leads.service.ts:881-892`（`confirmSource`） |

**前置数据**：
- 客资 `LEAD_SALES_A_2`：`assigned_sales_user_id='USR_SALES_A'`, `source_confirmed=0`, `contact_info="13900000002"`
- 销售甲在线

**测试步骤**：
1. 运营甲调 `PUT /api/leads/LEAD_SALES_A_2/confirm-source`
2. 销售甲前端 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200，返 `{ok:true}` |
| DB | 1 行 `type_code='lead_source_confirmed'`, `port_type='sales'`, `related_id='LEAD_SALES_A_2'`, `title='客资来源已确认'` |
| 路由 | `routeHint='/sales/leads/LEAD_SALES_A_2'` |
| socket | 销售甲在 3s 内收到 `notification.created` |
| leads 表 | `LEAD_SALES_A_2.source_confirmed=1` |

**DB 核对 SQL**：
```sql
SELECT id, type_code, port_type, related_id, title
FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='lead_source_confirmed'
ORDER BY created_at DESC LIMIT 1;
```

---

### TC-N12-003：N-03 `collaboration_requested` 接收方正确性（运营而非销售）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-003 |
| **用例标题** | N-03 `collaboration_requested` 接收方正确性（运营而非销售） |
| **触发源** | 销售 `POST /api/leads/:id/collaboration` |
| **接收方** | 客资来源运营（`leads.employee_id` 对应的 users.id），**不发给销售自己** |
| **优先级** | P0 |
| **关联需求** | `运营中台四端口.md §8.3` 销售申请运营协同 / TC-NOT-004 |
| **性能指标** | HTTP < 1s；socket 推送 < 3s |
| **关联源码** | `collaboration-tasks.service.ts:113-125` |

**前置数据**：
- 客资 `LEAD_SALES_A_3`：`assigned_sales_user_id='USR_SALES_A'`, `employee_id='EMP_OPS_A'`
- 运营甲在线；销售甲在线（用于验证不收）

**测试步骤**：
1. 销售甲调 `POST /api/leads/LEAD_SALES_A_3/collaboration`，body：`{type:"add_failed", reason:"客户微信号搜索不到"}`
2. 运营甲 socket 监听
3. 销售甲 60s 兜底轮询触发后再查自己的列表

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200，返 task 对象 |
| 运营甲 DB | 1 行 `collaboration_requested`, `port_type='operations'`, `receiver_id='USR_OPS_A'` |
| 销售甲 DB | **0 行** `collaboration_requested`（不应发给发起人自己） |
| 运营 socket | 3s 内 `notification.created` |
| 销售 socket | **0 事件** |
| 路由 | `/operation/collaboration?taskId=<task_id>` |
| leads | `LEAD_SALES_A_3.status='in_collaboration'` |

**DB 核对 SQL**：
```sql
-- 运营收
SELECT id, receiver_id, type_code, port_type, related_id
FROM notifications WHERE receiver_id='USR_OPS_A' AND type_code='collaboration_requested'
ORDER BY created_at DESC LIMIT 1;

-- 销售不收
SELECT COUNT(*) FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='collaboration_requested'
  AND created_at > NOW() - INTERVAL 1 MINUTE;
-- 期望 0
```

---

### TC-N12-004：N-04 `collaboration_handled` content 含 `handledNote`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-004 |
| **用例标题** | N-04 `collaboration_handled` content 含 `handledNote` |
| **触发源** | 运营 `POST /api/collaboration-tasks/:id/handle`，body 含 `handledNote` |
| **接收方** | `task.requesterId` 销售（**不发给运营自己**） |
| **优先级** | P0 |
| **关联需求** | TC-NOT-005 + N-P1-06 relatedId 修复（指向 task.id 而非 leadId） |
| **性能指标** | HTTP < 1s；socket 推送 < 3s |
| **关联源码** | `collaboration-tasks.service.ts:307-321`（N-P1-06 修复后） |

**前置数据**：
- 任务 `CT_1`：`requester_id='USR_SALES_A'`, `lead_id='LEAD_SALES_A_3'`, `status='handling'`
- 运营甲 + 销售甲在线

**测试步骤**：
1. 运营甲调 `POST /api/collaboration-tasks/CT_1/handle`，body：`{handledNote:"已用备用号联系上客户"}`
2. 销售甲 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200 |
| 销售甲 DB | 1 行 `collaboration_handled`, `port_type='sales'`, `content LIKE '%已用备用号联系上客户%'`, `related_id='CT_1'`（N-P1-06 修复：指向 task.id 而非 leadId）, `related_type='collaboration_task'` |
| 运营甲 DB | **0 行** `collaboration_handled`（避免自我通知） |
| 路由 | `/sales/collaboration?taskId=CT_1` |
| 销售 socket | 3s 内 `collaboration.handled` 事件 |

**DB 核对 SQL**：
```sql
SELECT id, type_code, port_type, related_id, related_type, content
FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='collaboration_handled'
ORDER BY created_at DESC LIMIT 1;
-- 期望 content LIKE '%已用备用号联系上客户%' AND related_id='CT_1' AND related_type='collaboration_task'

-- 运营不收
SELECT COUNT(*) FROM notifications
WHERE receiver_id='USR_OPS_A' AND type_code='collaboration_handled'
  AND created_at > NOW() - INTERVAL 1 MINUTE;
-- 期望 0
```

**回归覆盖**：N-P1-06 修复 — `relatedId` 必须指向 `task.id`（旧实现指向 `task.leadId` 会导致前端跳到客资详情而拿不到 task）。

---

### TC-N12-005：N-05 `collaboration_timeout` cron 30 分钟触发

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-005 |
| **用例标题** | N-05 `collaboration_timeout` cron 30 分钟触发 |
| **触发源** | `@Cron(EVERY_30_MINUTES)` 名称 `collabTimeoutScan`（手动 `runOnce()` 也可） |
| **接收方** | 来源运营 + 销售 + 全部 admin/owner（去重后最多 3 行） |
| **优先级** | P0 |
| **关联需求** | `运营中台四端口.md §10 WebSocket 事件` / `08.4` 主管提醒 - 协同超时 |
| **性能指标** | scan 单次 < 2s；socket 推送 < 3s |
| **关联源码** | `collaboration-tasks.service.ts:381-505`（`scanTimeouts`） |

**前置数据**：
- 任务 `CT_TIMEOUT_1`：`requester_id='USR_SALES_A'`, `handler_id='USR_OPS_A'`, `status='handling'`, `created_at=NOW()-25h`
- `COLLAB_TIMEOUT_HOURS=24`（环境配置）
- 运营甲 + 销售甲 + 主管丁全部在线

**测试步骤**：
1. 调管理端接口 `POST /api/admin/collaboration-tasks/run-timeout-scan`（暴露 `runOnce()`）或等 30 分钟 cron 触发
2. 三个用户同时监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 任务状态 | `CT_TIMEOUT_1.status` 由 `handling` → `timeout` |
| 通知数量 | ≥ 3 行（USR_OPS_A + USR_SALES_A + 全部 admin），`type_code='collaboration_timeout'`, `port_type='operations'` |
| 操作日志 | `operation_logs` 新增 1 条 `action='status_change'`, `detail` 含 `'pending/handling → timeout'` |
| 幂等 | 再次 `runOnce()` 不重复发通知（status=timeout 不再扫回去） |
| socket | 3 用户在 3s 内各自收到 1 次 `notification.created` |

**DB 核对 SQL**：
```sql
SELECT id, status FROM collaboration_tasks WHERE id='CT_TIMEOUT_1';
SELECT receiver_id, type_code, port_type FROM notifications
WHERE type_code='collaboration_timeout' AND created_at > NOW() - INTERVAL 1 HOUR
ORDER BY created_at DESC;
SELECT target_id, action, detail FROM operation_logs
WHERE target_id='CT_TIMEOUT_1' AND action='status_change'
ORDER BY created_at DESC LIMIT 1;
```

---

### TC-N12-006：N-06 `customer_added` addStatus=added 路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-006 |
| **用例标题** | N-06 `customer_added` addStatus=added 路径 |
| **触发源** | 销售 `PUT /api/leads/:id/board` body `addStatus='added'` |
| **接收方** | 客资来源运营（通过 `findUserIdByEmployeeId(lead.employeeId)` 反查） |
| **优先级** | P0 |
| **关联需求** | TC-NOT-007 |
| **性能指标** | HTTP < 1s；socket 推送 < 3s |
| **关联源码** | `leads.service.ts:354-370` |

**前置数据**：
- 客资 `LEAD_SALES_A_4`：`employee_id='EMP_OPS_A'`, `add_status='not_added'`
- 销售甲在线；运营甲在线

**测试步骤**：
1. 销售甲调 `PUT /api/leads/LEAD_SALES_A_4/board`，body：`{addStatus:"added"}`
2. 运营甲 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200 |
| 运营甲 DB | 1 行 `customer_added`, `port_type='operations'`, `related_id='LEAD_SALES_A_4'`, `title='客资已添加'` |
| 销售甲 DB | **0 行** `customer_added`（不发给自己） |
| 路由 | `/operation/leads?leadId=LEAD_SALES_A_4` |
| 销售 socket | 0 事件 |

**DB 核对 SQL**：
```sql
SELECT receiver_id, type_code, port_type, related_id FROM notifications
WHERE receiver_id='USR_OPS_A' AND type_code='customer_added'
  AND related_id='LEAD_SALES_A_4'
ORDER BY created_at DESC LIMIT 1;
SELECT COUNT(*) FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='customer_added'
  AND created_at > NOW() - INTERVAL 1 MINUTE;
-- 期望 0
```

**边界**：客资没有 `employee_id`（来源为空）则**不发通知**——这是 spec 允许的边界行为，依赖 `findUserIdByEmployeeId` 返回 null 短路。

---

### TC-N12-007：N-07 `customer_not_passed` addStatus=not_passed 路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-007 |
| **用例标题** | N-07 `customer_not_passed` addStatus=not_passed 路径 |
| **触发源** | 销售 `PUT /api/leads/:id/board` body `addStatus='not_passed'` |
| **接收方** | 客资来源运营 |
| **优先级** | P0 |
| **关联需求** | TC-NOT-008 |
| **性能指标** | HTTP < 1s；socket 推送 < 3s |
| **关联源码** | `leads.service.ts:371-383` |

**前置数据**：
- 客资 `LEAD_SALES_A_5`：`employee_id='EMP_OPS_A'`, `add_status='not_added'`
- 运营甲在线

**测试步骤**：
1. 销售甲调 `PUT /api/leads/LEAD_SALES_A_5/board`，body：`{addStatus:"not_passed", addStatusNote:"客户拒绝添加"}`
2. 运营甲 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200 |
| 运营甲 DB | 1 行 `customer_not_passed`, `title='客户未通过'`, `content='添加未通过'`, `port_type='operations'` |
| 路由 | `/operation/leads?leadId=LEAD_SALES_A_5` |
| leads | `LEAD_SALES_A_5.add_status='not_passed'`, `process_status='invalid'`（按 v1.2 spec） |

**DB 核对 SQL**：
```sql
SELECT title, content, port_type FROM notifications
WHERE receiver_id='USR_OPS_A' AND type_code='customer_not_passed'
ORDER BY created_at DESC LIMIT 1;
```

---

### TC-N12-008：N-08 `deal_closed` 三触发源：closeDeal/handOver/acceptHandover

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-008 |
| **用例标题** | N-08 `deal_closed` 三触发源：closeDeal/handOver/acceptHandover |
| **触发源** | 销售 `POST /api/orders`（closeDeal）/ 销售 `POST /api/orders/:id/hand-over` / 教务 `POST /api/orders/:id/accept` |
| **接收方** | closeDeal/handOver：教务 + admin/owner；acceptHandover：销售 |
| **优先级** | P0 |
| **关联需求** | TC-NOT-009 / TC-NOT-010 / TC-NOT-011 + v1.2 拆分 `order_created`/`order_handed_over`/`order_accepted` |
| **性能指标** | HTTP < 1.5s；socket 推送 < 3s |
| **关联源码** | `orders.service.ts:90-139`（closeDeal）、`:444-489`（handOver）、`:495-544`（acceptHandover） |

**前置数据**：
- 客资 `LEAD_DEAL_1`：`assigned_sales_user_id='USR_SALES_A'`, `status='in_followup'`
- 订单 `ORDER_PEND_1`：`sales_user_id='USR_SALES_A'`, `handover_status='pending'`（handOver/acceptHandover 用）
- 教务甲 + 主管丁 + 销售甲全部在线

**测试步骤**：
1. 销售甲调 `POST /api/orders`，body：`{leadId:"LEAD_DEAL_1", serviceType:"陪跑", amount:2980}`（closeDeal）
2. 教务甲 + 主管丁 socket 监听
3. 销售甲调 `POST /api/orders/ORDER_PEND_1/hand-over`（handOver）
4. 教务甲调 `POST /api/orders/ORDER_PEND_1/accept`（acceptHandover）
5. 销售甲 socket 监听 accept 通知

**预期结果**：

| 步骤 | 检查点 | 预期值 |
|------|--------|--------|
| 1 | HTTP | 200, `{ok:true, orderId:"ORDER_NEW_1"}` |
| 1 | DB | 2 行 `deal_closed`（或 v1.2 拆分后 `order_created`），`port_type='academic'`，`receiver_id IN (USR_ACA_A, USR_ADMIN_D)`，`title='新订单已成交'` |
| 1 | 销售 socket | 0 事件（closeDeal 不发给销售自己） |
| 3 | HTTP | 200 |
| 3 | DB | 1 行 `deal_closed`/`order_handed_over`, `title='订单待接收'`, `port_type='academic'` |
| 3 | 幂等 | 再次 handOver 不重复发（`if (order.handoverStatus === 'handed_over') return;`） |
| 4 | HTTP | 200 |
| 4 | DB | 1 行 `deal_closed`/`order_accepted`, `title='订单已被接收'`, `port_type='sales'`, `receiver_id='USR_SALES_A'` |

**DB 核对 SQL**：
```sql
-- closeDeal 通知
SELECT receiver_id, type_code, port_type, title, related_id FROM notifications
WHERE type_code IN ('deal_closed','order_created') AND related_id='ORDER_NEW_1'
ORDER BY created_at DESC;
-- 期望 2 行:receiver IN (USR_ACA_A, USR_ADMIN_D), port_type='academic', title='新订单已成交'

-- acceptHandover 通知
SELECT receiver_id, type_code, port_type, title FROM notifications
WHERE type_code IN ('deal_closed','order_accepted') AND related_id='ORDER_PEND_1'
  AND title='订单已被接收' ORDER BY created_at DESC LIMIT 1;
-- 期望 receiver_id='USR_SALES_A', port_type='sales'
```

**v1.2 拆分说明**：v1.2 修复后实际 typeCode 拆为 `order_created`（closeDeal）/ `order_handed_over`（handOver）/ `order_accepted`（acceptHandover），但**旧实现仍保留** `deal_closed` 写入以兼容历史数据。本用例 SQL 需兼容两种情况（IN 子句）。

---

### TC-N12-009：N-09 `order_node_due` orderNodeReminderScan cron 每分钟

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-009 |
| **用例标题** | N-09 `order_node_due` orderNodeReminderScan cron 每分钟 |
| **触发源** | `@Cron(EVERY_MINUTE)` 名称 `orderNodeReminderScan` |
| **接收方** | 跟进人 + 订单当前教务（去重后） |
| **优先级** | P0 |
| **关联需求** | TC-NOT-012 |
| **性能指标** | scan 单次 < 1s；socket 推送 < 3s |
| **关联源码** | `reminders.service.ts:30-108` |

**前置数据**：
- 订单 `ORDER_AFT_1`：`academic_user_id='USR_ACA_A'`, `sales_user_id='USR_SALES_A'`
- 跟进记录 `OFR_DUE_1`：`order_id='ORDER_AFT_1'`, `user_id='USR_ACA_A'`, `node_type='交付提醒'`, `content='请准备交付材料'`, `next_remind_at=NOW()-1min`, `reminder_sent_at=NULL`
- 教务甲在线

**测试步骤**：
1. 调 `RemindersService.runOnce()` 或等 1 分钟 cron 触发
2. 教务甲 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| DB 通知 | 1 行 `order_node_due`, `port_type='academic'`, `related_id='ORDER_AFT_1'`, `related_type='order'`, `receiver_id='USR_ACA_A'`（set 去重） |
| 跟进记录 | `OFR_DUE_1.reminder_sent_at = NOW()`（幂等标记） |
| 路由 | `/academic/orders/ORDER_AFT_1` |
| 幂等 | 再次 trigger `runOnce()` 不再发（COUNT 不增加） |
| 抄送销售 | **N-P1-07 未完成**：当前实现**不**抄送 `order.salesUserId`，与 spec 描述"节点到期通知销售/主管"不一致（已知缺陷） |

**DB 核对 SQL**：
```sql
-- 通知
SELECT receiver_id, type_code, port_type, related_id, content FROM notifications
WHERE type_code='order_node_due' AND related_id='ORDER_AFT_1'
ORDER BY created_at DESC LIMIT 1;

-- 幂等字段
SELECT reminder_sent_at FROM order_follow_records WHERE id='OFR_DUE_1';
-- 期望非 NULL

-- 销售不收（当前实现，N-P1-07 待补）
SELECT COUNT(*) FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='order_node_due'
  AND related_id='ORDER_AFT_1';
-- 期望 0（已知缺陷）
```

---

### TC-N12-010：N-10 `order_abnormal` 教务/销售异常反馈两条路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-010 |
| **用例标题** | N-10 `order_abnormal` 教务/销售异常反馈两条路径 |
| **触发源** | 路径 A：教务 `POST /api/orders/:id/follow-records` `nodeType` 含"异常"；路径 B：任意角色 `POST /api/orders/:id/abnormal-feedback` |
| **接收方** | 路径 A：仅 `order.salesUserId` 销售；路径 B：销售 + 教务 + 主管（reporter also receive） |
| **优先级** | P0 |
| **关联需求** | TC-NOT-013 + N-P1-03 portType 修复 |
| **性能指标** | HTTP < 1.5s；socket 推送 < 3s |
| **关联源码** | 路径 A：`orders.service.ts:380-394`；路径 B：`order-abnormal-feedback.service.ts:108-126`（create）+ `:223-241`（close） |

**前置数据**：
- 订单 `ORDER_ABN_1`：`sales_user_id='USR_SALES_A'`, `academic_user_id='USR_ACA_A'`
- 教务甲 + 销售甲 + 主管丁在线

**测试步骤（路径 A）**：
1. 教务甲调 `POST /api/orders/ORDER_ABN_1/follow-records`，body：`{nodeType:"素材异常-请补充", content:"客户迟迟不发素材", nextFollowTime:"..."}`
2. 销售甲 socket 监听

**测试步骤（路径 B）**：
1. 教务甲调 `POST /api/orders/ORDER_ABN_1/abnormal-feedback`，body：`{abnormalType:"client_uncooperative", description:"客户两周未回复", expectedHelper:"sales"}`
2. 销售甲 + 教务甲 + 主管丁 socket 监听

**预期结果**：

| 路径 | 检查点 | 预期值 |
|------|--------|--------|
| A | HTTP | 200 |
| A | DB | 1 行 `order_abnormal`, `port_type='sales'`, `receiver_id='USR_SALES_A'`, `title='订单异常'`（仅销售） |
| A | 教务 socket | 0 事件（不发给自己） |
| B | HTTP | 200 |
| B | DB | 3 行 `order_abnormal`, `port_type='academic'`（N-P1-03 修复后），`receivers IN (USR_SALES_A, USR_ACA_A, USR_ADMIN_D)`，**注意：主管可能因 portType='academic' 被过滤掉（已知缺陷 §11.3，见 TC-MRG-007）** |
| B | 路由 | `/academic/orders/ORDER_ABN_1` |
| B | 状态 | `orders.order_status='abnormal'` |

**DB 核对 SQL**：
```sql
-- 路径 A
SELECT receiver_id, type_code, port_type, title FROM notifications
WHERE type_code='order_abnormal' AND related_id='ORDER_ABN_1' AND port_type='sales'
ORDER BY created_at DESC LIMIT 1;
-- 期望 1 行:receiver='USR_SALES_A'

-- 路径 B
SELECT receiver_id, type_code, port_type, title FROM notifications
WHERE type_code='order_abnormal' AND related_id='ORDER_ABN_1'
ORDER BY created_at DESC;
-- 期望 ≥ 2 行:receivers 包含 USR_SALES_A + USR_ACA_A(reporter) + USR_ADMIN_D
```

---

### TC-N12-011：N-11 `import_done` 批量导入

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-011 |
| **用例标题** | N-11 `import_done` 批量导入 |
| **触发源** | 运营 `POST /api/imports/posts-bulk`（multipart/form-data 上传） |
| **接收方** | 任务发起人（运营，portType='operations'） |
| **优先级** | P1 |
| **关联需求** | TC-NOT-015 |
| **性能指标** | HTTP 立即返回（异步）；socket 推送取决于解析耗时（一般 < 30s） |
| **关联源码** | `posts-bulk-import.service.ts`（含异步 runImport） |

**前置数据**：
- 运营甲已登录
- 上传文件：`test-import.xlsx` 含 10 行有效账号

**测试步骤**：
1. 运营甲调 `POST /api/imports/posts-bulk`（multipart/form-data）
2. 立即获得 HTTP 响应（taskId）
3. 运营甲 socket 监听 `notification.created`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200，返 `{taskId:"IMP_1", status:"processing"}` |
| import_tasks | 1 行 `id='IMP_1'`, `status='processing'`（后续 'completed'） |
| DB 通知 | 1 行 `import_done`, `port_type='operations'`, `receiver_id='USR_OPS_A'`, `related_id='IMP_1'`, `related_type='import_task'` |
| 路由 | `buildRouteHint('operations','import_task','IMP_1')` → `/operation/imports?taskId=IMP_1`（N-P1-08 修复后） |
| socket | 异步完成后运营甲收 `notification.created` |
| 失败行 | 如有部分行失败，content 含失败原因 |

**DB 核对 SQL**：
```sql
SELECT receiver_id, type_code, port_type, related_id, related_type FROM notifications
WHERE type_code='import_done' AND related_id='IMP_1'
ORDER BY created_at DESC LIMIT 1;
SELECT id, status FROM import_tasks WHERE id='IMP_1';
-- 期望 status='completed'
```

---

### TC-N12-012：N-12 `export_done` 导出完成

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-N12-012 |
| **用例标题** | N-12 `export_done` 导出完成 |
| **触发源** | 任意端口 `POST /api/exports`（异步生成 → status='completed' 时触发） |
| **接收方** | 任务发起人（portType 按 userRole 决定：sales=学术/operations） |
| **优先级** | P0 |
| **关联需求** | TC-NOT-014 + N-P1-08 路由修复 |
| **性能指标** | HTTP 立即返回（异步）；socket 推送 < 5s（CSV 生成耗时） |
| **关联源码** | `exports.service.ts:148-325`（含 `runExport`） |

**前置数据**：
- 销售甲已登录

**测试步骤**：
1. 销售甲调 `POST /api/exports`，body：`{exportType:"leads", filterJson:{status:"in_followup"}}`
2. 立即获得 HTTP 响应（id=EXP_1）
3. 后台 `setImmediate` 异步跑 `runExport`
4. 销售甲 socket 监听

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| HTTP | 200, 返 `{id:"EXP_1", status:"processing"}` |
| 几秒后 DB 通知 | 1 行 `export_done`, `port_type='sales'`（按发起人 userRole 动态决定，`exports.service.ts:284-289`），`receiver_id='USR_SALES_A'`, `related_id='EXP_1'`, `related_type='export'` |
| 路由 | N-P1-08 修复后 `/academic/exports?taskId=EXP_1`（当前实现只跳转 academic 页面） |
| content | 含下载链接（`content LIKE '%http%'`） |
| 任务 | `export_tasks.status='completed'`, `file_url` 非空 |
| 操作日志 | `operation_logs` 有 1 条 `action='export_create'`, `detail` 含 `rowCount` |

**DB 核对 SQL**：
```sql
SELECT receiver_id, type_code, port_type, content, related_id, related_type FROM notifications
WHERE type_code='export_done' AND related_id='EXP_1'
ORDER BY created_at DESC LIMIT 1;
SELECT id, status, file_url FROM export_tasks WHERE id='EXP_1';
SELECT action, detail FROM operation_logs
WHERE target_id='EXP_1' AND action='export_create' ORDER BY created_at DESC LIMIT 1;
```

---

## 三、专项 A2：通知 routeHint 端到端逐个验证

> routeHint 是通知点击跳转的"业务关键字段"，直接决定用户能否从通知中心直接进入对应业务页面。07-通知和WebSocket测试用例.md TC-NOT-018/019/020 仅粗粒度覆盖，本专项对每个 type_code 单独验证 routeHint 准确性，含 null/异常回退和跨端口跳转。

### TC-RH-001：N-01 `lead_assigned` 跳转 `/sales/leads/{id}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-001 |
| **用例标题** | N-01 `lead_assigned` 跳转 `/sales/leads/{id}` |
| **关联需求** | 07-通知和WebSocket测试用例.md TC-NOT-018 仅粗粒度（销售+运营两种），本条细化为单独 N-01 路径 |
| **优先级** | P0 |
| **性能指标** | routeHint 生成 < 1ms；前端 router.push 后页面渲染 < 1s |
| **关联源码** | `notifications.service.ts:244-258`（`buildRouteHint`） |

**前置数据**：N-01 通知 N_LA_1：`related_type='lead'`, `related_id='LEAD_RH_1'`, `port_type='sales'`

**测试步骤**：
1. 销售甲登录，调 `GET /api/notifications`，取 N_LA_1
2. 解析 `routeHint` 字段
3. 前端点击该通知
4. 浏览器地址栏变化

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/sales/leads/LEAD_RH_1` |
| 跳转 | `router.push(routeHint)` 成功，URL 变为 `/sales/leads/LEAD_RH_1` |
| 详情页 | 销售端客资详情页加载，展示 LEAD_RH_1 完整字段 |
| markRead | `PATCH /api/notifications/N_LA_1/read` 成功，`changed=true` |

---

### TC-RH-002：N-02 `lead_source_confirmed` 跳转 `/operation/leads?leadId={id}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-002 |
| **用例标题** | N-02 `lead_source_confirmed` 跳转 `/operation/leads?leadId={id}` |
| **优先级** | P0 |

**前置数据**：N-02 通知 N_LSC_1：`related_type='lead'`, `related_id='LEAD_LSC_1'`, `port_type='sales'`

**测试步骤**：
1. 销售甲登录，触发 confirmSource 生成 N_LSC_1
2. 销售甲点击 N_LSC_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/leads?leadId=LEAD_LSC_1`（运营视角的 lead 详情，因为 sales 也通过该 routeHint 进入运营 lead 详情 tab） |
| 跳转 | URL 含 `?leadId=` |
| 页面 | 销售端能正确访问运营 lead 详情（受销售端权限控制，仅展示分配给自己的 lead） |

**注意**：与 `lead_assigned` 不同，`lead_source_confirmed` 当前 buildRouteHint 走 `lead` 分支 + `portType='sales'`，但业务上跳转的应该是 `related_id` 对应的 lead 详情。需验证前端 `NotificationListPage` / `NotificationBell` 在销售端对 `related_type='lead'` 仍能渲染运营端客资详情（权限受控）。

---

### TC-RH-003：N-03 `collaboration_requested` 跳转 `/operation/collaboration?taskId={taskId}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-003 |
| **用例标题** | N-03 `collaboration_requested` 跳转 `/operation/collaboration?taskId={taskId}` |
| **优先级** | P0 |

**前置数据**：N-03 通知 N_CR_1：`related_type='collaboration_task'`, `related_id='CT_RH_1'`, `port_type='operations'`

**测试步骤**：
1. 运营甲登录，取 N_CR_1
2. 点击 N_CR_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/collaboration?taskId=CT_RH_1` |
| 跳转 | URL 完整 |
| 页面 | 运营端协同任务详情，taskId 解析正确 |
| CollaborationPage | 内部 store/query 通过 `taskId` 正确拉取任务数据 |

---

### TC-RH-004：N-04 `collaboration_handled` 跳转 `/sales/collaboration?taskId={taskId}`（routeHint 与 leadId 混淆缺陷专项）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-004 |
| **用例标题** | N-04 `collaboration_handled` 跳转 `/sales/collaboration?taskId={taskId}`（routeHint 与 leadId 混淆缺陷专项） |
| **优先级** | P0 |
| **关联需求** | 11.6 已知缺陷 + N-P1-06 修复 |
| **关联源码** | `collaboration-tasks.service.ts:307-321`（N-P1-06 修复后 `relatedId=task.id`） |

**前置数据**：
- 任务 `CT_RH_2`：`requester_id='USR_SALES_A'`, `lead_id='LEAD_RH_2'`, `status='handling'`
- 运营甲处理任务，触发 N_CH_1
- 通知 N_CH_1 应为：`related_id=CT_RH_2`, `related_type='collaboration_task'`（**修复后指向 task.id**）

**测试步骤**：
1. 销售甲登录，取 N_CH_1
2. 解析 `routeHint`
3. 浏览器访问该 URL
4. 验证 CooperationPage 是否能正确加载任务

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 修复后 routeHint | `/sales/collaboration?taskId=CT_RH_2`（**修复前会错误指向 `LEAD_RH_2`**，导致页面找不到 task） |
| 修复后页面 | CooperationPage 解析 taskId=CT_RH_2，加载任务状态='handled', handler='USR_OPS_A', handledNote |
| 修复前（已知缺陷） | `/sales/collaboration?taskId=LEAD_RH_2`，页面找不到 task，显示"任务不存在"或空数据 |

**回归覆盖**：N-P1-06 修复前 relatedId=task.leadId，本用例是验证修复后**必须**指向 task.id 的关键回归用例。

---

### TC-RH-005：N-05 `collaboration_timeout` 跳转 `/operation/collaboration?taskId={taskId}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-005 |
| **用例标题** | N-05 `collaboration_timeout` 跳转 `/operation/collaboration?taskId={taskId}` |
| **优先级** | P0 |

**前置数据**：N-05 通知 N_CT_1：`related_type='collaboration_task'`, `related_id='CT_RH_3'`, `port_type='operations'`

**测试步骤**：
1. 运营甲登录，取 N_CT_1
2. 点击 N_CT_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/collaboration?taskId=CT_RH_3` |
| 跳转 | 运营端协同任务详情，任务已 timeout |
| content | 包含超时时长（如"已超过 24 小时未处理"） |

---

### TC-RH-006：N-06 `customer_added` 跳转 `/operation/leads?leadId={id}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-006 |
| **用例标题** | N-06 `customer_added` 跳转 `/operation/leads?leadId={id}` |
| **优先级** | P0 |

**前置数据**：N-06 通知 N_CA_1：`related_type='lead'`, `related_id='LEAD_RH_3'`, `port_type='operations'`

**测试步骤**：运营甲点击 N_CA_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/leads?leadId=LEAD_RH_3` |
| 跳转 | 运营端客资看板，自动定位 LEAD_RH_3 |

---

### TC-RH-007：N-07 `customer_not_passed` 跳转 `/operation/leads?leadId={id}` 携带上下文

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-007 |
| **用例标题** | N-07 `customer_not_passed` 跳转 `/operation/leads?leadId={id}` 携带上下文 |
| **优先级** | P0 |

**前置数据**：N-07 通知 N_CNP_1：`related_type='lead'`, `related_id='LEAD_RH_4'`, `content` 含 `addStatusNote="客户拒绝添加"`

**测试步骤**：
1. 运营甲点击 N_CNP_1
2. 运营端客资详情页加载后查看是否自动展开"销售备注/未通过说明"区域

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/leads?leadId=LEAD_RH_4` |
| 跳转 | URL 完整 |
| 上下文 | 详情页若支持 query 参数自动滚动到 `addStatusNote` 字段，则滚动到；否则仅按 leadId 加载，运营自行查看 |
| addStatus | 客资 `add_status='not_passed'` |

**关联源码**：当前 buildRouteHint 仅生成 leadId，**不携带** `?tab=note` 之类的二级定位参数 — 这是可优化的扩展点（如 `?tab=note&note=客户拒绝添加`），但当前实现不强制。

---

### TC-RH-008：N-08 `deal_closed` 跳转 `/academic/orders/{id}` + `/sales/orders/{id}` 双路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-008 |
| **用例标题** | N-08 `deal_closed` 跳转 `/academic/orders/{id}` + `/sales/orders/{id}` 双路径 |
| **优先级** | P0 |

**前置数据**：
- 通知 N_DC_AC：`type_code='deal_closed'`/`order_created`, `port_type='academic'`, `receiver_id='USR_ACA_A'`, `related_id='ORDER_RH_1'`
- 通知 N_DC_SA：`type_code='deal_closed'`/`order_accepted`, `port_type='sales'`, `receiver_id='USR_SALES_A'`, `related_id='ORDER_RH_1'`

**测试步骤**：
1. 教务甲点击 N_DC_AC
2. 销售甲点击 N_DC_SA

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 教务 routeHint | `/academic/orders/ORDER_RH_1`（`buildRouteHint('academic','order',id)`） |
| 销售 routeHint | `/sales/orders/ORDER_RH_1`（`buildRouteHint('sales','order',id)`） |
| 双路径 | 同一订单根据 portType 生成不同 URL，前端各自正确加载 |

---

### TC-RH-009：N-09 `order_node_due` 跳转 `/academic/orders/{id}?tab=node`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-009 |
| **用例标题** | N-09 `order_node_due` 跳转 `/academic/orders/{id}?tab=node` |
| **优先级** | P0 |

**前置数据**：N-09 通知 N_OD_1：`related_type='order'`, `related_id='ORDER_RH_2'`, `port_type='academic'`

**测试步骤**：教务甲点击 N_OD_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/academic/orders/ORDER_RH_2` |
| 跳转 | 教务端订单详情页 |
| tab=node | **当前实现未生成** `?tab=node` 参数（已知扩展点 — 前端订单详情若支持 query 解析，则可扩展为 `?tab=reminder` 跳到节点提醒 tab） |
| 显示 | 详情页能查到 OFR_DUE_X 跟进记录（reminder_sent_at 已被 set） |

---

### TC-RH-010：N-10 `order_abnormal` 跳转 `/sales/orders/{id}?tab=abnormal`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-010 |
| **用例标题** | N-10 `order_abnormal` 跳转 `/sales/orders/{id}?tab=abnormal` |
| **优先级** | P0 |

**前置数据**：N-10 通知 N_OA_1：`related_type='order'`, `related_id='ORDER_RH_3'`

**测试步骤**：
1. 销售甲点击 N_OA_1（路径 A 通知 `port_type='sales'`）
2. 教务甲点击 N_OA_1（路径 B 通知 `port_type='academic'`）

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 销售 routeHint | `/sales/orders/ORDER_RH_3` |
| 教务 routeHint | `/academic/orders/ORDER_RH_3` |
| tab=abnormal | 当前实现未生成，前端需手动切到异常 tab |
| 销售端 ListPage | `NotificationListPage.tsx:64-72` 显式跳 `/sales/orders/<id>`（已实现兜底） |

**关联源码**：`NotificationListPage.tsx:64-72` 全列表版对 `order_abnormal` 显式兜底跳 `/sales/orders/<id>`，但**铃铛版** `NotificationBell.tsx` 走 `buildRouteHint` → 取决于 portType。

---

### TC-RH-011：N-11 `import_done` 跳转 `/operation/imports?taskId={id}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-011 |
| **用例标题** | N-11 `import_done` 跳转 `/operation/imports?taskId={id}` |
| **优先级** | P1 |
| **关联需求** | N-P1-08 修复（import_task / import 分支已补齐） |

**前置数据**：N-11 通知 N_ID_1：`related_type='import_task'`, `related_id='IMP_RH_1'`, `port_type='operations'`

**测试步骤**：运营甲点击 N_ID_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/operation/imports?taskId=IMP_RH_1`（N-P1-08 修复后） |
| 跳转 | 运营端导入历史页，自动定位任务 |
| 修复前 | routeHint=null，仅 markRead 不跳转（v1.1 行为） |

---

### TC-RH-012：N-12 `export_done` 跳转 `/academic/exports?taskId={id}`

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-012 |
| **用例标题** | N-12 `export_done` 跳转 `/academic/exports?taskId={id}` |
| **优先级** | P1 |
| **关联需求** | N-P1-08 修复（export 分支） |

**前置数据**：N-12 通知 N_ED_1：`related_type='export'`, `related_id='EXP_RH_1'`

**测试步骤**：销售甲点击 N_ED_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/academic/exports?taskId=EXP_RH_1`（N-P1-08 修复后统一跳 academic 页面） |
| 跳转 | 销售甲能访问 academic/exports 页面（跨端口，需前端路由处理） |
| content | 包含下载链接（`content LIKE '%http%'`） |
| 修复前 | routeHint=null，仅 markRead 不跳转 |

**已知限制**：N-P1-08 当前实现 export 统一跳 academic 页，**未来**若新增 `/operation/exports` / `/sales/exports` / `/admin/exports`，再按 portType 分支细化。

---

### TC-RH-013：routeHint 为 null 时的 fallbackRoute 行为

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-013 |
| **用例标题** | routeHint 为 null 时的 fallbackRoute 行为 |
| **优先级** | P0 |
| **关联源码** | `NotificationBell.tsx:82-103`（`fallbackRoute`） |

**前置数据**：通知 N_NULL_1：`related_type=null` 或 `related_id=null`（人工插入脏数据或 type 未实现）

**测试步骤**：
1. 模拟通知 `routeHint=null`（通过 `buildRouteHint` 返回 null 的场景，例如 relatedType 未知）
2. 用户点击通知

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | null |
| fallbackRoute | `NotificationBell.tsx:82-103` 按 relatedType 子串匹配：`lead` → `/operation/leads?leadId=` 或 `/sales/leads/`；`collaboration` → `/operation/collaboration?taskId=` 或 `/sales/collaboration?taskId=`；`order` → `/academic/orders?orderId=` 等 |
| 其他 type | 仍为 null，**仅 markRead 不跳转**（`router.push(null)` 不执行） |
| 用户体验 | 看到消息已读但无视觉跳转反馈，可能疑惑 |

**DB 核对**：
```sql
-- 模拟脏数据
INSERT INTO notifications (id, receiver_id, type_code, port_type, related_id, related_type, read_status, created_at)
VALUES ('N_NULL_1', 'USR_SALES_A', 'unknown_type', 'sales', NULL, NULL, 0, NOW());
```

---

### TC-RH-014：routeHint 异常时的回退路径

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-014 |
| **用例标题** | routeHint 异常时的回退路径 |
| **优先级** | P1 |

**前置数据**：
- 通知 N_BAD_1：`related_id='INVALID_ID'`（DB 中不存在的 leadId/taskId/orderId）
- `buildRouteHint` 仍会生成 `/sales/leads/INVALID_ID`（不校验 related_id 是否真实存在）

**测试步骤**：用户点击 N_BAD_1

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| routeHint | `/sales/leads/INVALID_ID`（按字面量生成） |
| 跳转 | URL 跳转成功，但目标页面 API 调用 `GET /api/leads/INVALID_ID` 返 404 |
| 页面 | 销售端客资详情页显示"客资不存在"或 loading 后空态 |
| 前端兜底 | 详情页应有 try/catch 或错误提示 |

**关联优化建议**：`buildRouteHint` 可考虑**先校验 relatedId 存在**再生成 routeHint，避免无效跳转。

---

### TC-RH-015：routeHint 跨端口跳转（运营收到跳到主管端）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-RH-015 |
| **用例标题** | routeHint 跨端口跳转（运营收到跳到主管端） |
| **优先级** | P2 |
| **特殊场景** | 同账号双端口登录（3000 + 3001） |

**前置数据**：
- 运营甲同时登录 3000 和 3001
- 主管端 3001 推送 typeCode='admin_xxx' 通知给运营甲（实际场景：跨端口超管消息）
- 或运营甲在 3000 收到一条 `port_type='admin'` 的通知（已知缺陷 §11.3，主管兜底可能写入 portType='academic'，运营过滤后看不到）

**测试步骤**：
1. 运营甲在 3000 登录
2. 触发场景：异常反馈路径 B 写入 portType='academic' 给主管
3. 主管在 3000 的 admin 视角下应能拉到这条通知（但 resolvePortType='operations' 过滤掉，**拉不到**）
4. 主管在 3001 登录是否能看到？

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 3000 主管视角 | **0 通知**（被 portType 过滤，已知缺陷） |
| 3001 owner 视角 | 当前实现 owner 端 NotificationContext 与 3000 共享/独立（待 TC-OWNS-008 验证），若独立则也拉不到 |
| 跨端口路由 | routeHint 跨端口（如 `/admin/...` 跳到 3001 路径）当前实现不支持，URL 仍是 3000 路径，会 404 |
| 用户体验 | 主管从通知中心跳不过去，必须手动切端口 |

**关联缺陷**：N-P1-10 未完成 + §11.3 主管兜底 + §11.10 unreadCount 跨端口 — 跨端口通知是当前实现盲区。

---

## 四、专项 A3：离线补拉 / 断线重连 / 多端登录的边界场景

> 07-通知和WebSocket测试用例.md 第九章有 §9.1-§9.5 覆盖，但**深度不足**（每条仅 1 个变体）。本专项扩展 10 个细粒度边界用例。

### TC-OFFL-001：用户断网 5 分钟后恢复 → 60s 兜底轮询（POLL_INTERVAL_MS）补齐离线通知

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-001 |
| **用例标题** | 用户断网 5 分钟后恢复 → 60s 兜底轮询（POLL_INTERVAL_MS）补齐离线通知 |
| **关联需求** | 07 §7.3 兜底轮询 / TC-NOT-041 |
| **优先级** | P0 |
| **性能指标** | 断网期间通知落库 < 1s（HTTP 触发后立即落库，emit 失败不影响 DB）；恢复后下一次 60s 轮询拉到所有离线通知 |
| **关联源码** | `NotificationContext.tsx:145-158`（`setInterval(pollNotifications, 60_000)`） |

**前置数据**：销售甲在线，socket 已连

**测试步骤**：
1. 销售甲 Chrome DevTools → Network → Disable network 5 分钟
2. 第 1 分钟运营甲触发 1 条 `lead_assigned`
3. 第 3 分钟运营甲再触发 1 条 `collaboration_handled`
4. 第 5 分钟恢复网络
5. 记录 60s 兜底轮询触发时间 T1
6. 检查 `GET /api/notifications` 返回

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 断网期间 | 销售甲 0 事件（socket 不在线） |
| DB | 2 条新通知已落库 |
| 恢复网络 | socket 自动重连（指数退避 1s→10s） |
| 重连后 | server **不补发**历史 emit（设计预期） |
| 60s 轮询 | T1 之后调 `GET /api/notifications?limit=20`，返回 2 条新通知 |
| items 头部 | `addNotification` 把 2 条新通知插入 items 头部 |
| 红点 | 累计 +2（每次 `addNotification` 内部去重，但跨断网期间是不同 ID，所以 +2） |
| 总耗时 | 离线 5 分钟 + 60s 轮询间隔 = 最坏 5 分 60s 后看到全部离线通知 |

**注意点**：
- 60s 轮询是**核心**离线补看机制 — 任何 socket 漏掉的事件都能补
- 用户点"刷新"按钮立即 `refresh()`，不等 60s

---

### TC-OFFL-002：同一用户设备 A 在线、设备 B 登录后设备 A 是否被踢（同 session 互踢）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-002 |
| **用例标题** | 同一用户设备 A 在线、设备 B 登录后设备 A 是否被踢（同 session 互踢） |
| **关联需求** | CLAUDE.md Dual-Port Auth — 内存 Map session |
| **优先级** | P0 |
| **性能指标** | 设备 B 登录响应 < 2s；设备 A socket 在 < 1s 内收到 `notification:error` + 强制 logout |
| **关联源码** | `server.js:550-580`（`authRequired`）/ `notifications.gateway.ts`（socket auth） |

**前置数据**：销售甲在 PC（设备 A）登录；用同一账号在手机（设备 B）登录

**测试步骤**：
1. 设备 A 销售甲登录，记录 token_A 和 socket.id_A
2. 设备 B 销售甲登录同一账号，记录 token_B
3. 设备 A 监听 `notification:error` + `auth-changed` 事件
4. 设备 A 检查当前页面是否被踢下线

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| token_B 存储 | 内存 Map 中同一 userId 被覆盖为 token_B（CLAUDE.md 说明 "in-memory Map sessions"） |
| 设备 A HTTP | 下次 API 请求带 token_A，**应**被拒绝（401）— 当前实现"后登录踢前登录"是预期行为 |
| 设备 A socket | 仍连接中（**socket 鉴权已完成**，只在握手时校验 token） — **当前实现不主动踢** socket 房间 |
| 设备 A 事件 | 当前实现**不**主动发 `notification:error` 通知设备 A 已被踢 |
| 数据一致性 | 设备 A 仍能看自己的消息列表（前端 store 还在），但调 API 全部 401 |
| 修复建议 | 实现应在 token 失效时**主动 emit** 设备 A socket 通知 + 强制 disconnect |

**潜在缺陷回归**：当前实现对"同账号多设备互踢"在 socket 层面**不**完整处理 — 需 PC-端配合 storage 事件监听 `auth-changed` 才能知道被踢。

---

### TC-OFFL-003：多端同时收同一通知的去重逻辑（addNotification 去重）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-003 |
| **用例标题** | 多端同时收同一通知的去重逻辑（addNotification 去重） |
| **关联需求** | TC-NOT-018 + §11.5 多 tab race |
| **优先级** | P0 |
| **关联源码** | `NotificationContext.tsx:106-116`（`addNotification` 内部 `if (prev.some(...))` 去重） |

**前置数据**：销售甲开 3 个 tab（Tab1/Tab2/Tab3），全部登录

**测试步骤**：
1. 3 个 tab 各自连接 socket，加入同一 `user:USR_SALES_A` 房间
2. 运营甲触发 1 条 `lead_assigned`
3. 3 个 tab 各自 devtools 观察
4. 等待 60s 兜底轮询触发

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| socket 推送 | server.to(room).emit 广播 → 3 个 socket **各收 1 次** `notification.created`（socket.io room 推送不去重） |
| Tab1 addNotification | items 数组中无该 id → 插入 1 条 |
| Tab2 addNotification | 同上，items 插入 1 条（tab2 自己的 React state） |
| Tab3 addNotification | 同上 |
| DB | 1 行（`notificationsService.create` 内部按 receivers 去重） |
| Tab1 红点 | +1 |
| Tab2 红点 | +1 |
| Tab3 红点 | +1 |
| 跨 tab 一致 | **不一致** — 每个 tab 维护自己的 React state，无 `localStorage` / `BroadcastChannel` 同步 |
| 60s 轮询 | 3 个 tab 各自 refresh 一次，items 全部包含该通知（来自 DB） |

**潜在问题**：用户感觉"通知被加了 3 次"（每个 tab +1），实际 DB 只有 1 条。已知缺陷，**需 BroadcastChannel 跨 tab 同步 unreadCount**（§11.5 修复建议）。

---

### TC-OFFL-004：WebSocket 长时间空闲（> 5 分钟）服务端是否发送 ping

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-004 |
| **用例标题** | WebSocket 长时间空闲（> 5 分钟）服务端是否发送 ping |
| **优先级** | P1 |
| **性能指标** | 空闲 5 分钟内 socket 连接保持（不主动断开） |
| **关联源码** | socket.io 默认 `pingInterval=25000ms`, `pingTimeout=20000ms`（依据 socket.io 默认值） |

**前置数据**：销售甲登录，socket 已连

**测试步骤**：
1. 保持页面打开，不操作 5 分钟
2. DevTools Network 查看 WebSocket frames
3. 验证是否收到 `ping` frame / 收到 `pong` 响应

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 心跳 | socket.io 默认每 25s 客户端发 `ping`，服务端 20s 内返 `pong`（默认值） |
| 业务层心跳 | `notification:ping` → `notification:pong` 由前端 `socket.emit('notification:ping')` 触发（应用层心跳），服务端响应 `{ok:true, event:'notification:pong'}` |
| 连接状态 | 5 分钟后 socket.connected 仍为 true |
| 断线超时 | 若网络中断 20s，服务端未收到 pong → 主动断开 → 客户端触发重连 |
| 资源占用 | 长连接保持，CPU/内存占用可忽略（socket.io 默认实现） |

**关联源码**：`notifications.gateway.ts` 未配置自定义 `pingInterval`/`pingTimeout`，使用 socket.io 默认值。

---

### TC-OFFL-005：服务器重启后 Bearer Token 失效场景（in-memory Map）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-005 |
| **用例标题** | 服务器重启后 Bearer Token 失效场景（in-memory Map） |
| **关联需求** | CLAUDE.md "Sessions are lost on server restart" |
| **优先级** | P0 |
| **关联源码** | `server.js:550-580`（in-memory Map） |

**前置数据**：销售甲登录，获取 token_A

**测试步骤**：
1. 销售甲已登录，所有 API/socket 正常
2. 服务端 `kill -9` 进程，重启
3. 销售甲浏览器仍打开，socket 仍 connected（暂时）
4. 销售甲发起任意 API 请求
5. 销售甲触发新业务操作期望收通知

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| API 请求 | 401 Unauthorized（in-memory Map 已清空，token_A 不存在） |
| socket | 仍 connected=true（socket 不感知服务端重启，但下一次 emit/handleConnection 失败） |
| socket 心跳 | 下一次 `ping` 失败（服务端 socket.io 进程已重启，client.sid 失效） |
| 客户端反应 | 触发 socket.io 重连机制，但服务端 401 reject → 收到 `notification:error` |
| 前端反应 | `localStorage.removeItem('token')` + `window.location.href='/login'` |
| 用户体验 | **数据完全丢失**，必须重新登录 |

**注意点**：
- 这是**已知架构限制** — in-memory Map 不持久化
- 生产环境建议接入 Redis session store
- 通知数据本身**不丢失**（在 MySQL），用户重新登录后能看到全部历史通知

---

### TC-OFFL-006：用户登录后立即触发通知（socket 尚未连接完成）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-006 |
| **用例标题** | 用户登录后立即触发通知（socket 尚未连接完成） |
| **优先级** | P0 |
| **关联源码** | `NotificationContext` 初始化时序：login → mount → `useNotificationSocket(token, userId)` → io() → 握手 |

**前置数据**：销售甲 token_A 已获得

**测试步骤**：
1. 销售甲刚登录（HTTP 200 返回 token_A，**socket 尚未连接**）
2. 立即（< 100ms）运营甲触发 1 条 `lead_assigned`（同 TC-N12-001 步骤 1）
3. 销售甲 socket 客户端监听（socket 在 200ms-1s 内连接成功）
4. 60s 兜底轮询触发

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 触发时序 | 运营甲 `POST /api/leads` 服务端 emit `notification.created` → 销售甲 socket **未就绪**，emit 失败但 DB 已落库 |
| socket 推送 | 销售甲 socket 连接后**不补发**历史（预期） |
| 60s 轮询 | 兜底轮询触发后 `GET /api/notifications?limit=8` 返回该通知 |
| 红点 | +1（通过 refresh 路径） |
| toast | 销售甲**不**看到 toast（socket 事件未收到） |
| items 头部 | refresh 拉到的 items 中含该通知（按 createdAt DESC 排序） |

**潜在缺陷**：用户错过 toast（业务重要提示），仅在铃铛列表看到。可优化为"最近 5 秒的未读通知触发 toast"，但当前实现不覆盖。

---

### TC-OFFL-007：socket 认证失败后是否有重连机制

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-007 |
| **用例标题** | socket 认证失败后是否有重连机制 |
| **优先级** | P0 |
| **关联源码** | `notifications.gateway.ts:21-38`（`handleConnection` 失败 `client.disconnect(true)`） |

**前置数据**：销售甲 token 故意篡改

**测试步骤**：
1. 销售甲用篡改的 token_A 初始化 socket
2. socket.io 客户端发起 `io(url, {auth:{token:'INVALID_TOKEN'}})`
3. 监听 `notification:error` 事件
4. 等待 socket.io 重连

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 握手 | 后端 `JwtService.verify(token)` 失败 → emit `notification:error {message: "登录状态已失效"}` + `client.disconnect(true)` |
| 客户端 | 收到 `notification:error` |
| socket.connected | 立即 false |
| 自动重连 | socket.io 客户端默认 `reconnection=true`，1s 后自动重连，但**用相同 INVALID_TOKEN** → 仍失败 |
| 死循环 | socket.io 指数退避重连 5 次后仍失败 → 触发 `reconnect_failed` 事件（开发者需监听） |
| 用户体验 | 铃铛红点不更新（socket 始终未连上），60s 轮询兜底但 token 失效后 HTTP 401 也会拉不到 |
| 修复建议 | socket 认证失败应**停止重连**（`reconnection: false`），并触发 `localStorage.removeItem('token')` + 跳转登录页 |

---

### TC-OFFL-008：后端 Redis 不可用时 socket 推送降级到 polling

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-008 |
| **用例标题** | 后端 Redis 不可用时 socket 推送降级到 polling |
| **关联需求** | `v1.2-b端-redis适配说明.md` — 本地开发保留单机模式 + 60s 轮询兜底 |
| **优先级** | P1 |

**前置数据**：当前部署 PM2 fork 单实例，无 Redis adapter

**测试步骤**：
1. 销售甲登录
2. 停掉模拟的 Redis 服务（若有）
3. 观察 socket 推送是否正常
4. 60s 兜底轮询是否触发

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| Redis adapter | 当前实现**不引用** `@socket.io/redis-adapter`（依据 redis 适配说明） |
| 单实例推送 | 内存 adapter 在 PM2 fork 单实例下工作正常 |
| Redis 不可用 | 业务**不阻塞**（Redis 仅用于 BullMQ 队列和缓存，详见 `v1.2-b端-redis适配说明.md`） |
| 兜底轮询 | 60s 兜底始终运行，与 Redis 可用性无关 |
| 失败模式 | 若未来部署多副本 + Redis 不可用 → 跨实例推送丢失，仅靠 60s 轮询兜底（最长 60s 延迟） |

**关联文档**：`v1.2-b端-redis适配说明.md` 明确说明"未来真正水平扩展 / 多副本部署时，按以下步骤接入"，本用例是验证当前不接入 Redis 时的降级行为。

---

### TC-OFFL-009：用户 B 篡改 socket handshake auth 中的 userId（伪造 userId 收他人通知）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-009 |
| **用例标题** | 用户 B 篡改 socket handshake auth 中的 userId（伪造 userId 收他人通知） |
| **关联需求** | socket 鉴权安全 |
| **优先级** | P0（**安全**） |
| **关联源码** | `notifications.gateway.ts:21-38`（`handleConnection` 鉴权） |

**前置数据**：销售乙 socket 客户端

**测试步骤**：
1. 销售乙用**自己的** token_B 初始化 socket，但 query 传 `userId=USR_SALES_A`（销售甲的 userId）
2. socket.io 客户端 `io(url, {auth:{token:token_B, userId:'USR_SALES_A'}, query:{userId:'USR_SALES_A'}})`
3. 监听 `notification.connected` 事件
4. 运营甲触发 1 条 `lead_assigned` 给销售甲

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 握手 | 后端 `JwtService.verify(token_B)` 成功 → 解析 `payload.sub` 作为权威 userId（**忽略** query/auth 中的 userId） |
| 加入房间 | `client.join('user:payload.sub')` = `user:USR_SALES_B`（即销售乙自己的房间） |
| 事件推送 | 销售甲的通知 → 推送给 `user:USR_SALES_A` 房间 → 销售乙 socket **不收** |
| 安全性 | 攻击失败 — 后端以 token 中的 sub 为权威，不信任 client 传入的 userId |
| 验证 | DevTools 抓包，销售乙 socket 0 事件 |

**关联源码**：`notifications.gateway.ts:21-38` 鉴权后**重新**从 token 拿 userId 并 join 房间，不使用 client 传入的 userId — 这是正确的安全实践。

---

### TC-OFFL-010：socket disconnect 后未 ack 通知的兜底拉取顺序

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OFFL-010 |
| **用例标题** | socket disconnect 后未 ack 通知的兜底拉取顺序 |
| **关联需求** | 60s 兜底轮询的顺序保证 |
| **优先级** | P1 |

**前置数据**：销售甲在线

**测试步骤**：
1. 销售甲 socket 连接
2. 运营甲连续触发 5 条不同通知（间隔 1s 一条）
3. 销售甲在第 1 条推送后立即 `socket.disconnect()`
4. 记录每条通知的 createdAt
5. 销售甲 60s 后 reconnect + 60s 兜底轮询触发
6. 调 `GET /api/notifications?limit=20`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| DB | 5 条新通知按 createdAt 升序排列 |
| 兜底顺序 | `GET /api/notifications` 返回按 `read_status ASC, created_at DESC`（未读优先 + 时间倒序） |
| items 顺序 | items[0] = 第 5 条（最新），items[4] = 第 1 条（最早） |
| 未读 | 全部 5 条 read_status=0，未读优先展示 |
| 红点 | +5（兜底轮询 refresh 后 unreadCount 累加） |
| 时间戳 | items[].createdAt 严格递减 |

**注意点**：
- 服务端**不持久化**未 ack 的事件队列（socket.io emit 是一次性 fire-and-forget）
- 兜底完全依赖 DB（权威源）+ 60s 轮询
- 跨断网期间排序不受客户端时区影响（DB 存 UTC，详见 TC-NOT-026）

---

## 五、专项 A4：通知优先级 / 合并 / 去重的深度场景

### TC-MRG-001：同一 lead 5 分钟内连续触发 lead_assigned 多次（去重逻辑）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-001 |
| **用例标题** | 同一 lead 5 分钟内连续触发 lead_assigned 多次（去重逻辑） |
| **优先级** | P0 |
| **关联需求** | 通知合并/去重 |

**前置数据**：客资 `LEAD_MRG_1`（同一 lead 多次分配场景）

**测试步骤**：
1. T+0s：运营甲 `POST /api/leads`，分配给销售甲（创建 LEAD_MRG_1）
2. T+30s：主管丁 `PUT /api/leads/LEAD_MRG_1`，改派给销售甲（重复）
3. T+60s：运营甲再次 `PUT /api/leads/LEAD_MRG_1`，再次改派给销售甲
4. T+5min：运营甲再次 `PUT /api/leads/LEAD_MRG_1`，再次改派给销售甲

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| DB 通知 | **4 条** `lead_assigned`（业务层不主动去重） |
| 销售甲铃铛 | 4 条全部展示（不合并） |
| 销售甲体验 | 同一 lead 5 分钟内被通知 4 次，**可能感觉刷屏** |
| 当前实现 | 业务模块（leads.service、leads.controller 改派路径）**不**做 5 分钟内去重 |
| 优化建议 | 引入 `notifications` 写入前查重（`WHERE related_id=? AND type_code=? AND receiver_id=? AND created_at > NOW() - 5min`），存在则跳过 |

**注意点**：这是**已知问题**，未在 v1.2 P1 修复范围内（agent 未处理通知刷屏场景）。

---

### TC-MRG-002：同一订单 1 分钟内 order_updated 多次（合并展示）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-002 |
| **用例标题** | 同一订单 1 分钟内 order_updated 多次（合并展示） |
| **关联需求** | N-P1-02 order_updated 通知 + 30s 去重缓存 |
| **优先级** | P0 |
| **关联源码** | `orders.service.ts:emitOrderUpdated` 30s 去重窗口（`ORDER_UPDATED_DEDUP_MS = 30_000`） |

**前置数据**：订单 `ORDER_MRG_1`

**测试步骤**：
1. T+0s：教务甲 `PATCH /api/orders/ORDER_MRG_1`，body `{orderStatus:"in_progress"}`
2. T+10s：教务甲 `PATCH /api/orders/ORDER_MRG_1`，body `{paidStatus:"partial"}`
3. T+20s：教务甲 `PATCH /api/orders/ORDER_MRG_1`，body `{remark:"补充说明"}`
4. T+35s：教务甲 `PATCH /api/orders/ORDER_MRG_1`，body `{orderStatus:"to_deliver"}`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| T+0s 通知 | 1 条 `order_updated`, `content='订单 ORDER_MRG_1 更新了：订单状态'` |
| T+10s 通知 | 0（30s 窗口内去重，dedupKey=`ORDER_MRG_1:paidStatus` 但 last 30s 内 cache 不空，仍有别的字段被记 — 实际：dedupKey 是 `orderId:changedFieldsSorted`，不同字段不同 dedupKey，**仍会发**） |
| T+20s 通知 | 0（同 T+10s 分析，仍会发） |
| T+35s 通知 | 1 条（30s 窗口外） |
| 总通知数 | 3-4 条 |
| N-P1-02 实现细节 | dedupKey = `${orderId}:${changedFieldsSorted}`，**不同字段组合**会产生不同 dedupKey，不去重；**同字段组合** 30s 内去重 |

**注意点**：
- N-P1-02 的去重粒度是 `(orderId, changedFields 组合)`，不是 `(orderId, 全部)`
- 实际"同一订单 1 分钟内 order_updated 多次"在不同字段组合下仍会刷屏
- **优化建议**：dedupKey 改为 `${orderId}` 即可，30s 内任意字段更新只发 1 条（带最新变更字段列表）

---

### TC-MRG-003：通知 type 枚举中已下线类型 lead_deal_done、supervisor_suggestion 是否仍写入

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-003 |
| **用例标题** | 通知 type 枚举中已下线类型 lead_deal_done、supervisor_suggestion 是否仍写入 |
| **关联需求** | §11.1 enum 一致性 / N-P1-01 |
| **优先级** | P0 |
| **关联源码** | `shared/notifications.ts`（业务模块入口） + `constants/notification-types.ts`（派生层） |

**前置数据**：当前 `shared/notifications.ts` 已删除 `LEAD_DEAL_DONE` 和 `SUPERVISOR_SUGGESTION`（N-P1-01 修复），保留为 `@deprecated` 兼容

**测试步骤**：
1. 检索 `grep -rn "LEAD_DEAL_DONE\|SUPERVISOR_SUGGESTION\|lead_deal_done\|supervisor_suggestion" backend/src/`
2. 模拟业务代码误用 `typeCode: 'lead_deal_done'` 或 `'supervisor_suggestion'`
3. 触发业务操作
4. 查 DB

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 当前实现 | 业务模块 import `NOTIFICATION_TYPES`（来自 `shared/notifications.ts`）→ 编译期阻止误用（TypeScript 联合类型检查） |
| 编译检查 | `npx tsc --noEmit` 业务代码引用 `NOTIFICATION_TYPES.LEAD_DEAL_DONE` 报错（已删除） |
| 旧数据 | DB 历史数据中可能存在 `type_code='lead_deal_done'`/`'supervisor_suggestion'` 的脏行（v1.0 时期写入） |
| 列表展示 | `StatusTag code="lead_deal_done"` 在前端 enum 中保留 label 占位（`constants/enums.js` 同步注释）— 老数据仍可显示 |
| 新写入 | **0 行**新 `lead_deal_done`/`supervisor_suggestion` 通知 |

**DB 核对 SQL**：
```sql
-- 检查脏数据
SELECT id, type_code, created_at FROM notifications
WHERE type_code IN ('lead_deal_done', 'supervisor_suggestion')
ORDER BY created_at DESC LIMIT 10;

-- 回归验证：新写入统计
SELECT type_code, COUNT(*) FROM notifications
WHERE created_at > NOW() - INTERVAL 1 DAY
GROUP BY type_code;
-- 期望不含 lead_deal_done / supervisor_suggestion
```

---

### TC-MRG-004：lead_assigned 的 sender_id 为运营 vs 主管（改派）时的 title/content 差异

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-004 |
| **用例标题** | lead_assigned 的 sender_id 为运营 vs 主管（改派）时的 title/content 差异 |
| **优先级** | P1 |

**前置数据**：N-01 通知按触发者分两类

**测试步骤**：
1. 路径 A：运营甲 `POST /api/leads` 分配给销售甲 → 通知 N_LA_OPS：`sender_id=USR_OPS_A`, `title='新客资已分配'`
2. 路径 B：主管丁 `PUT /api/leads/:id` 改派给销售甲 → 通知 N_LA_ADM：`sender_id=USR_ADMIN_D`, `title='客资已改派给您'`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| sender_id | 路径 A = USR_OPS_A，路径 B = USR_ADMIN_D |
| title | 路径 A: '新客资已分配'，路径 B: '客资已改派给您'（**title 必须有差异**，否则用户无法区分） |
| content | 路径 A: 含客资基础信息（昵称/联系方式），路径 B: 含 "从 USR_SALES_X 改派给您" |
| 前端 | StatusTag 标签一致（都是 lead_assigned），但 title 文本区分 |
| type_code | 两条都是 `lead_assigned`（同 typeCode 不同元数据） |

**DB 核对 SQL**：
```sql
SELECT id, sender_id, title, content FROM notifications
WHERE receiver_id='USR_SALES_A' AND type_code='lead_assigned'
ORDER BY created_at DESC LIMIT 5;
-- 期望 2 行:title='新客资已分配' AND '客资已改派给您'
```

---

### TC-MRG-005：批量导入 import_done 通知触发场景

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-005 |
| **用例标题** | 批量导入 import_done 通知触发场景 |
| **优先级** | P1 |

**前置数据**：运营甲发起批量导入，导入 100 行

**测试步骤**：
1. 运营甲上传 100 行 `posts-bulk` 导入文件
2. 异步等待
3. 检查 1 条 `import_done` 是否被发出
4. content 是否含成功/失败行数

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 通知数 | 1 条（不管成功/失败行数，只发 1 条总结通知） |
| content | 含成功行数、失败行数（如"成功 95 行，失败 5 行"） |
| 失败行导出 | 若有失败行，content 含错误文件下载链接（CSV） |
| 路由 | `/operation/imports?taskId=IMP_MRG_1` |
| 接收方 | 仅运营甲（任务发起人） |

---

### TC-MRG-006：30 分钟扫描器发的 collaboration_timeout 重复触发的幂等性

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-006 |
| **用例标题** | 30 分钟扫描器发的 collaboration_timeout 重复触发的幂等性 |
| **关联需求** | TC-NOT-045 已超时任务不再重复通知 |
| **优先级** | P0 |

**前置数据**：任务 `CT_TIMEOUT_2`：`status='timeout'`（已扫描过一次）

**测试步骤**：
1. 记录当前通知数 N
2. 触发 `runOnce()` 一次
3. 记录 N1
4. 30 分钟后 cron 再次扫描
5. 记录 N2

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| N1 - N | 0（已 timeout 不再扫） |
| N2 - N1 | 0（30 分钟后再次扫描仍跳过） |
| 日志 | 每次 scan 都有 "skipped X" 日志（已 timeout 任务数） |
| DB | 任务状态保持 'timeout'，无状态变化 |

**DB 核对 SQL**：
```sql
SELECT status FROM collaboration_tasks WHERE id='CT_TIMEOUT_2';
-- 期望 'timeout' 始终不变

SELECT COUNT(*) FROM notifications
WHERE type_code='collaboration_timeout' AND created_at > NOW() - INTERVAL 1 HOUR
  AND related_id IN (SELECT id FROM collaboration_tasks WHERE status='timeout');
-- 期望 0 新增
```

---

### TC-MRG-007：通知按 portType 过滤的边界（admin/owner 收 operations 通知）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-007 |
| **用例标题** | 通知按 portType 过滤的边界（admin/owner 收 operations 通知） |
| **关联需求** | §11.3 主管兜底 + §11.10 unreadCount 跨端口 |
| **优先级** | P0 |

**前置数据**：
- 主管丁 `USR_ADMIN_D`：`role=admin`，`resolvePortType='operations'`
- 写入：异常反馈路径 B 创建 portType='academic' 的 order_abnormal 通知（主管兜底）

**测试步骤**：
1. 教务甲触发异常反馈给主管
2. 主管丁调 `GET /api/notifications`（resolvePortType='operations'）
3. 主管丁调 `GET /api/notifications/unread-count`
4. 直接查 DB

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| DB | 1 行 `order_abnormal`, `port_type='academic'`, `receiver_id='USR_ADMIN_D'` |
| 接口 1 | **不含**该通知（被 portType=operations 过滤）— 主管拉不到 |
| 接口 2 | unreadCount 不含该条（同样过滤） |
| 主管铃铛 | 0 红点（实际有通知但被过滤） |
| 已知缺陷 | §11.3 — 异常反馈的"主管兜底"形同虚设 |

**DB 核对 SQL**：
```sql
SELECT receiver_id, port_type, type_code FROM notifications
WHERE receiver_id='USR_ADMIN_D' AND type_code='order_abnormal'
ORDER BY created_at DESC LIMIT 5;
-- 期望有 academic/order_abnormal 记录

-- 主管接口过滤后
SELECT receiver_id, port_type, type_code FROM notifications
WHERE receiver_id='USR_ADMIN_D' AND port_type='operations'
  AND created_at > NOW() - INTERVAL 1 HOUR;
-- 期望不含 order_abnormal
```

**修复建议**（§11.3）：
- 选项 A：order-abnormal-feedback.service.ts 创建通知时 `portType='operations'`
- 选项 B：主管端 resolvePortType 拆为多个 portType，列表聚合
- 选项 C：新增 `admin` 端口（`portType='admin'`）

---

### TC-MRG-008：同 receiver 在不同端口页面（同角色）切换时通知状态保持

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-008 |
| **用例标题** | 同 receiver 在不同端口页面（同角色）切换时通知状态保持 |
| **优先级** | P1 |

**前置数据**：销售甲在 3000 销售端多个 tab 打开（Tab1=主页，Tab2=消息中心）

**测试步骤**：
1. 销售甲 Tab1 收到 `lead_assigned`，铃铛红点 +1
2. 切到 Tab2（消息中心）打开铃铛
3. Tab2 自动 `refresh()` 拉列表
4. 在 Tab2 看到该通知，**不**点击（仍 unread）
5. 切回 Tab1
6. Tab1 红点是否仍 +1（应保持，因为没 markRead）

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| Tab1 红点 | 切回 Tab1 仍 +1（unreadCount 在 Tab1 自己的 React state 中） |
| Tab2 红点 | 仍 +1 |
| items | 跨 tab 一致（refresh 拉的是同一个 DB） |
| 未点击 | read_status=0，铃铛一直红 |
| 跨 tab 状态 | **不自动同步**（无 storage 事件 / BroadcastChannel 同步） |
| 潜在问题 | 用户在 Tab2 阅读但未点击时，Tab1 红点不消失（即使主观已"看过了"） |

**注意点**：当前实现是"乐观未读" — 真正"已读"必须是后端 `markRead` 成功。

---

### TC-MRG-009：通知超过 90 天后是否归档 / 清理

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-009 |
| **用例标题** | 通知超过 90 天后是否归档 / 清理 |
| **关联需求** | notifications 表数据生命周期管理 |
| **优先级** | P2 |
| **关联源码** | 当前实现**未发现**自动归档 cron |

**前置数据**：3 个月前插入的旧通知 N_OLD_1：`created_at = NOW() - 100 day`

**测试步骤**：
1. 销售甲调 `GET /api/notifications?limit=200`（拉到第 N 条按时间倒序）
2. 销售甲 `GET /api/notifications?status=unread&limit=200` 查 100 天前的未读
3. 查 DB `COUNT(*) FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 列表 | 仍返回（未做归档） |
| 性能 | 100 天前的通知查询性能差（`read_status ASC, created_at DESC` 索引仍能命中） |
| 存储 | 大量历史数据累积，DB 体积膨胀 |
| 当前实现 | **无自动清理**（已知 gap，建议 P2 优化） |
| 业务影响 | 用户的"未读列表"可能含 100 天前的历史通知（运营端/教务端长期未处理的客户回访提醒） |

**关联优化建议**：
1. 引入 `notifications_archive` 表，90 天前自动迁移
2. `notifications` 表保留 90 天内
3. `GET /api/notifications` 默认只查 90 天内
4. 列表加"查看更早通知"按钮

---

### TC-MRG-010：通知 channelType / priority 字段（v1.2 schema 是否新增）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-MRG-010 |
| **用例标题** | 通知 channelType / priority 字段（v1.2 schema 是否新增） |
| **关联需求** | 未来扩展：多通道（站内/邮件/短信）、优先级（high/normal/low） |
| **优先级** | P2 |
| **关联源码** | 当前 `notification.entity.ts` 仅有 `id/receiver_id/sender_id/port_type/type_code/title/content/related_id/related_type/read_status/created_at/updated_at` — **无** channelType/priority 字段 |

**前置数据**：N/A

**测试步骤**：
1. 查 `notification.entity.ts` schema
2. 查 DB `DESCRIBE notifications`
3. 尝试 `UPDATE notifications SET channel='sms' WHERE id=?` 应报错（字段不存在）

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| schema 字段 | 无 channelType/priority |
| 业务影响 | 所有通知走"站内"通道，无法区分"高优先级"显示 |
| 当前铃铛 | 统一红点 +1，不能按优先级分颜色/排序 |
| 优化建议 | v2.0 增加：<br>- `channel_type VARCHAR(32)` ('inbox'/'email'/'sms'/'wechat')<br>- `priority TINYINT` (0=normal, 1=high, 2=urgent)<br>- 铃铛按 priority 排序，high 显示橙色，urgent 显示红色 |

---

## 六、专项 A5：3001 端口 WebSocket 独立命名空间

> 3001 端口是 owner 端（角色仅 owner），与 3000 端口员工/管理端**端口隔离**。`09-总后台测试用例.md §8.1 TC-OW-024` 提到"总后台使用独立命名空间（如 `/owner`）"，本专项验证 10 个细粒度场景。

### TC-OWNS-001：3000 端口的 socket.io 命名空间 vs 3001 端口命名空间隔离

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-001 |
| **用例标题** | 3000 端口的 socket.io 命名空间 vs 3001 端口命名空间隔离 |
| **关联需求** | 09-总后台测试用例.md TC-OW-024 |
| **优先级** | P0 |
| **关联源码** | 3000: `notifications.gateway.ts:@WebSocketGateway` 默认 namespace `/notifications`；3001: 待查（可能为 `/owner` 或 `/notifications`） |

**前置数据**：销售甲（3000）+ owner_test1（3001）

**测试步骤**：
1. 销售甲在 3000 连接 socket，监听 `notification.created`
2. owner_test1 在 3001 连接 socket，监听 `notification.created`
3. 运营甲触发 1 条 `lead_assigned` 给销售甲
4. 两端 DevTools 查看 socket frames

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 3000 socket 命名空间 | `/notifications`（默认） |
| 3001 socket 命名空间 | 独立命名空间（具体名由实际实现决定，可能是 `/owner` 或 `/notifications` 但仅限 owner 角色入房） |
| 房间隔离 | `user:USR_SALES_A`（3000）vs `user:USR_OWNER_1`（3001）— 不同 userId 不同房间 |
| 销售甲事件 | 收到 1 次 `notification.created` |
| owner_test1 事件 | 0 次（无通知发给 owner） |
| 跨端口串扰 | **不发生** — 房间隔离 + portType 过滤 |

**验证方法**：
```js
// 3000 端
const sock1 = io('http://localhost:3000/notifications', { auth: { token: token_3000, userId: 'USR_SALES_A' } });
// 3001 端
const sock2 = io('http://localhost:3001/owner', { auth: { token: token_3001, userId: 'USR_OWNER_1' } });
// 或
const sock2 = io('http://localhost:3001/notifications', { auth: { token: token_3001, userId: 'USR_OWNER_1' } });
```

---

### TC-OWNS-002：3001 端口的 notification.connected 事件 payload 格式

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-002 |
| **用例标题** | 3001 端口的 notification.connected 事件 payload 格式 |
| **优先级** | P0 |

**前置数据**：owner_test1 已登录 3001

**测试步骤**：
1. owner_test1 浏览器 DevTools 查看 socket frames
2. 监听 `notification.connected` / `notification:connected`

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 事件 | 收到 `notification.connected` 或 `notification:connected` |
| payload | `{ok: true, userId: 'USR_OWNER_1', role: 'owner'}`（可能含 role 字段标识 owner 端口） |
| 房间 | `user:USR_OWNER_1` |
| 与 3000 一致性 | 字段命名一致（兼容前端 NotificationContext 共用） |

---

### TC-OWNS-003：3000 通知不发送到 3001 owner（除非 owner 在 3000 也登录）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-003 |
| **用例标题** | 3000 通知不发送到 3001 owner（除非 owner 在 3000 也登录） |
| **关联需求** | owner 角色禁止登录 3000（CLAUDE.md）— 因此 3000 通知不会到 3001 |
| **优先级** | P0 |

**前置数据**：owner_test1 仅在 3001 登录

**测试步骤**：
1. owner_test1 在 3001 连接 socket
2. 运营甲在 3000 触发任意通知给销售甲
3. owner_test1 socket 不应收到

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| owner 收 | 0 事件 |
| DB | owner_test1 无 receiver_id=USR_OWNER_1 的通知（业务层不会发给 owner） |
| 房间 | `user:USR_OWNER_1` 无广播 |

**DB 核对 SQL**：
```sql
SELECT COUNT(*) FROM notifications WHERE receiver_id='USR_OWNER_1';
-- 期望业务触发时 0（owner 不收业务通知）
```

---

### TC-OWNS-004：3001 owner 端推送的 type 过滤（如 N-01 是否也推）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-004 |
| **用例标题** | 3001 owner 端推送的 type 过滤（如 N-01 是否也推） |
| **优先级** | P1 |

**前置数据**：人工制造 1 条 `type_code='lead_assigned'` 写入 `notifications` 表 `receiver_id='USR_OWNER_1'`

**测试步骤**：
1. owner_test1 在 3001 监听 `notification.created`
2. 不触发任何业务（因为业务不会发 owner），仅观察该人工插入的通知是否会通过 socket 推送

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| socket 推送 | **是**（gateway 推所有匹配 `user:uid` 房间的通知，不按 typeCode 过滤） |
| 前端展示 | NotificationBell 显示 lead_assigned 标签 |
| 业务正常 | 该 typeCode 不会被业务触发（owner 不收 lead_assigned），本用例仅验证人工异常数据下的推送行为 |

**注意点**：3001 与 3000 共享同一个 `notifications` 表 + 同一个 `notifications.gateway.ts`（**推断**，需源码确认），推送机制一致；type 过滤在前端做。

---

### TC-OWNS-005：3001 socket 鉴权失败时是否静默断开

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-005 |
| **用例标题** | 3001 socket 鉴权失败时是否静默断开 |
| **优先级** | P0 |

**前置数据**：owner_test1 用错误 token 登录 3001

**测试步骤**：
1. 用错误 token 初始化 3001 socket
2. 监听 `notification:error` 事件
3. 等待 1s

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 握手失败 | `JwtService.verify` 失败 |
| 事件 | emit `notification:error {message: "登录状态已失效"}` |
| 断开 | `client.disconnect(true)` |
| 静默 | **否** — 客户端能收到 error 事件 |
| 重连 | socket.io 默认重连，但 3001 端是否有相同问题（与 3000 一致：reconnection=true，相同 INVALID_TOKEN 重连仍失败） |

---

### TC-OWNS-006：3001 端 SSE/Polling 兜底

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-006 |
| **用例标题** | 3001 端 SSE/Polling 兜底 |
| **优先级** | P1 |
| **关联源码** | 推断 3001 端 NotificationContext 同样有 60s 兜底轮询（基于 3000 实现） |

**前置数据**：owner_test1 登录 3001

**测试步骤**：
1. 阻断 3001 WebSocket
2. 60s 等待
3. DevTools Network 观察 3001 端 `GET /api/notifications` 请求

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 60s 轮询 | 3001 端每 60s 发 1 次 `GET /api/notifications` |
| 端口 | 必须是 3001（如 `/api/notifications`） |
| 鉴权 | 3001 端 token 鉴权（与 3000 不同的 `authRequired` middleware） |
| 端口判断 | NotificationContext 必须根据当前 origin 自动判断 baseUrl（`window.location.origin`） |

**潜在缺陷**：若 3001 与 3000 共享前端 `app.js`，轮询 baseUrl 写死为 3000，则 3001 端跨域请求失败。需源码确认。

---

### TC-OWNS-007：3001 多 owner 同时在线通知广播

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-007 |
| **用例标题** | 3001 多 owner 同时在线通知广播 |
| **优先级** | P0 |

**前置数据**：owner_test1 + owner_test2 同时登录 3001

**测试步骤**：
1. owner_test1 连接 3001 socket（加入 `user:USR_OWNER_1`）
2. owner_test2 连接 3001 socket（加入 `user:USR_OWNER_2`）
3. 人工插入 1 条 `receiver_id='USR_OWNER_1'` 的通知
4. 观察两端

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| owner_test1 | 收到 1 次（仅自己） |
| owner_test2 | 0 次 |
| 房间隔离 | `user:USR_OWNER_1` ≠ `user:USR_OWNER_2` |
| 端口共享 | 3001 socket 命名空间下多 owner 共存 |

---

### TC-OWNS-008：owner 端 NotificationContext 与 3000 共享/独立

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-008 |
| **用例标题** | owner 端 NotificationContext 与 3000 共享/独立 |
| **优先级** | P0 |
| **关联源码** | 推断 3000/3001 共享同一前端（同一 `app.js` + NotificationContext 单例） |

**前置数据**：owner_test1 登录 3001；同账号无法登录 3000（CLAUDE.md 限制）

**测试步骤**：
1. owner_test1 登录 3001，初始化 NotificationContext
2. 检查 `localStorage.getItem('user')` 和 `localStorage.getItem('token')`
3. 验证 baseUrl

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| localStorage.user | `{id: 'USR_OWNER_1', role: 'owner', port: 3001}`（或类似结构） |
| localStorage.token | owner_test1 的 token |
| 3000 共享 | **否**（独立 localStorage by port? — 需源码确认：实际上 localStorage 是 origin 隔离的，3000 和 3001 是不同 origin 所以 localStorage 各自独立） |
| baseUrl | `window.location.origin`（3001 自动取 3001） |
| NotificationProvider | 3001 端单独 mount，refCount 单实例 |

**注意点**：浏览器 localStorage 严格按 origin 隔离（3000 vs 3001 是不同 origin），所以"共享"实际是分别存 — 用户在 3000/3001 分别登录有各自的 token/user。

---

### TC-OWNS-009：3001 socket 断线后的端口判断（避免跳错端口）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-009 |
| **用例标题** | 3001 socket 断线后的端口判断（避免跳错端口） |
| **优先级** | P0 |

**前置数据**：owner_test1 在 3001 收到 1 条通知 `routeHint='/operation/orders/ORDER_OWNER_1'`（人工构造）

**测试步骤**：
1. owner_test1 点击该通知
2. 浏览器地址栏变化

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| 当前 origin | `http://localhost:3001` |
| routeHint | `/operation/orders/ORDER_OWNER_1`（**运营端路径**） |
| 跳转行为 | 当前 origin + routeHint = `http://localhost:3001/operation/orders/...`（**跳错端口**） |
| 结果 | 3001 端没有 `/operation/...` 路由 → 404 或重定向 |
| 用户体验 | **混乱** — 通知中心在 3001，但跳转目标是 3000 路径 |

**潜在缺陷**：routeHint 不携带 origin 信息，前端 `router.push(routeHint)` 默认 push 到当前 origin。若 3001 端收到 3000 路径的 routeHint，跳转会失败。

**修复建议**：
- routeHint 改为完整 URL（含 origin），或
- 前端根据 `window.location.origin` 自动选择目标 origin
- 或 owner 端 NotificationListPage 对非本端口 routeHint 不跳转，仅 markRead

---

### TC-OWNS-010：3001 owner 端自定义通知（与 supervisor 区分）

| 字段 | 内容 |
|------|------|
| **用例编号** | TC-OWNS-010 |
| **用例标题** | 3001 owner 端自定义通知（与 supervisor 区分） |
| **关联需求** | 总后台有独立通知（老板驾驶舱视角） |
| **优先级** | P2 |
| **关联源码** | 推断 owner 端 NotificationContext 与 supervisor 端不同（独立业务逻辑） |

**前置数据**：N/A

**测试步骤**：
1. 调研源码：是否存在 `ownerNotificationService` 或 `notifications.gateway` 内部对 owner role 走不同分支
2. 触发场景：异常反馈 → 主管兜底（receiver 含 admin/owner）
3. owner 在 3001 拉通知列表

**预期结果**：

| 检查点 | 预期值 |
|--------|--------|
| owner 自定义通知 | 推断**无**（当前实现 owner 复用同一 notifications 表） |
| 与 supervisor 区分 | 端口不同（3001 vs 3000），但 NotificationContext 共享 |
| 老板驾驶舱专属通知 | 未来扩展点（如"业绩告警""低活跃员工""流失客资"）— 当前未实现 |
| 当前行为 | owner 看到的通知 = supervisor 在 admin 视角下看到的通知（被 portType='operations' 过滤后的子集） |

**关联需求**：`09-总后台测试用例.md §8.1` 仅提到"独立 socket 命名空间"，未定义"独立通知类型"。本用例是验证当前实现边界。

---

## 七、执行建议

### 7.1 执行顺序

1. **优先 A1（TC-N12-001~012）**：每个 typeCode 单独跑通，建立基础数据
2. **再跑 A2（TC-RH-001~015）**：依赖 A1 创建的通知
3. **然后 A3（TC-OFFL-001~010）**：模拟断网/重连/多端
4. **A4（TC-MRG-001~010）**：边界场景和合并去重
5. **最后 A5（TC-OWNS-001~010）**：3001 端口专项（依赖 3001 服务运行）

### 7.2 测试数据准备

- 销售甲/乙、运营甲、主管丁、owner_test1、owner_test2 测试账号
- 客资 LEAD_NEW_1 / LEAD_SALES_A_2~5 / LEAD_SALES_B_1 / LEAD_MRG_1 等
- 订单 ORDER_NEW_1 / ORDER_PEND_1 / ORDER_AFT_1 / ORDER_ABN_1 / ORDER_RH_1~3 等
- 协同任务 CT_1 / CT_TIMEOUT_1~2 / CT_RH_1~3
- 导出任务 EXP_1 / EXP_RH_1
- 导入任务 IMP_1 / IMP_RH_1 / IMP_MRG_1

### 7.3 自动化建议

- **socket.io-client** 脚本可直接复用 07-通知和WebSocket测试用例.md §5 的脚本模板
- **Nginx 反代**：3000/3001 双端口同 server_name 不同 location（依赖实际部署）
- **数据快照**：每跑完一个 typeCode，备份对应 `notifications` 行用于回归

### 7.4 工具脚本模板

```js
// 销售甲 socket 客户端
const io = require('socket.io-client');
const sock = io('http://localhost:3000/notifications', {
  auth: { token: '<SALES_A_JWT>' },
  query: { userId: 'USR_SALES_A' },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
});
sock.on('connect', () => console.log('connected', sock.id));
sock.on('notification.created', (p) => console.log('CREATE', p));
sock.on('notification:new', (p) => console.log('NEW', p));
sock.on('notification.connected', (p) => console.log('HELLO', p));
sock.on('notification:error', (p) => console.error('ERR', p));
sock.on('disconnect', (r) => console.log('disconnect', r));
sock.on('reconnect', (n) => console.log('reconnect', n));
```

---

## 八、关联文档

- `doc/运营中台四端口.md` §8.4 提醒分类 / §10 WebSocket 事件 / §11 性能
- `doc/B端-v1.2-通知和WebSocket测试用例.md`（基础 36 个 TC + 11 个已知缺陷）
- `doc/B端-P1修复-通知1-5.md`（N-P1-01~05）
- `doc/B端-P1修复-通知6-10.md`（N-P1-06~10）
- `doc/v1.2-b端-redis适配说明.md`（Redis 性能 / 60s 兜底）
- `doc/test-cases/07-通知和WebSocket测试用例.md`（TC-NOT-001~072，本专项为缺口补充）
- `doc/test-cases/09-总后台测试用例.md`（TC-OW-024~026 3001 端口 WebSocket/导出）
- `doc/test-cases/10-全局视觉与交互测试用例.md`（跨端口 UI 一致性）

---

> 文档结束
>
> **总用例数：57 个**（TC-N12-001 ~ TC-N12-012 共 12 个 + TC-RH-001 ~ TC-RH-015 共 15 个 + TC-OFFL-001 ~ TC-OFFL-010 共 10 个 + TC-MRG-001 ~ TC-MRG-010 共 10 个 + TC-OWNS-001 ~ TC-OWNS-010 共 10 个）

