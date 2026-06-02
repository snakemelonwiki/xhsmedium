# B 端 1.2 测试用例 数据只读核查报告

> 编写日期：2026-06-02
> 核查方式：MySQL 8.0 只读查询（无任何 DML/DDL）
> 核查范围：6 个新测试文档 + 1 个旧 B 端详细测试用例文档（共 366+ 个 TC）
> 核查目标：找出**测试文档假设与实际数据库不一致**的所有问题

---

## 0. 关键结论速览

| 类别 | 问题数 | 严重度 |
| --- | --- | --- |
| A. 字段名不符（测试文档 DB 核对 SQL 写错字段名） | 7 | 🔴 P0（SQL 跑不起来） |
| B. 枚举值不匹配（中文 vs 英文） | 5 | 🟡 P1（断言失败） |
| C. 业务数据不足（无法支撑状态机用例） | 3 | 🟡 P1（前置缺失） |
| D. 关联断点 | 2 | 🟡 P1（脏数据） |
| E. 缺失表 | 1 | 🔴 P0（用例无法执行） |
| F. v1.2 已实现字段确认 | 5 | ✅ OK |
| **合计** | **18+** | — |

---

## 1. 全表数据盘点

| 表 | 行数 | 备注 |
| --- | --- | --- |
| `users` | 16 | 含 6 个新补建账号 |
| `employees` | 9 | 8 个原有 + 1 个新 emp-academic-02 |
| `accounts` | 178 | 全部 status=正常、platform=小红书/抖音 |
| `posts` | 472 | post_type=获客贴/素人贴/话题贴 |
| `leads` | 108 | 全部 status=新客资、add_status=未添加、process_status=未接 |
| `post_metrics` | **不存在** | ❌ |
| `lead_follow_records` | 0 | 空表 |
| `lead_files` | 0 | 空表 |
| `collaboration_tasks` | 0 | 空表 |
| `orders` | 0 | 空表 |
| `order_follow_records` | 0 | 空表 |
| `notifications` | 0 | 空表 |
| `exports` | 0 | 空表 |
| `operation_logs` | 0 | 空表 |
| `favorites` | 0 | 空表 |
| `import_tasks` | 0 | 空表 |
| `lead_drafts` | 0 | 空表 |

---

## 2. 字段名不符 🔴 P0

测试文档 `doc/v1.2-完整交付版-AB端任务分配.md` §10.2 / §10.3 与实际 DB schema 不一致，导致 6 个新测试文档中**所有 DB 核对 SQL 跑不起来**。

### 2.1 `leads` 表字段对照

| v1.2 文档期望（§10.2） | 实际 DB 字段 | 状态 |
| --- | --- | --- |
| `operator_id` | `employee_id` | ❌ 名称错（含义相同） |
| `sales_id` | `assigned_sales_user_id` | ❌ 名称错（含义相同） |
| `source_account_id` | `account_id` | ❌ 名称错（含义相同） |
| `source_post_id` | `post_id` | ❌ 名称错（含义相同） |
| `status` | `status` | ✅ |
| `add_status` | `add_status` | ✅ |
| `process_status` | `process_status` | ✅ |
| `deal_status` | **不存在** | ❌ 字段缺失 |
| `collaboration_status` | **不存在** | ✅ 按设计不存储（从 collab 派生） |

### 2.2 `orders` 表字段对照

| v1.2 文档期望（§10.3） | 实际 DB 字段 | 状态 |
| --- | --- | --- |
| `lead_id` | `lead_id` | ✅ |
| `sales_id` | `sales_user_id` | ❌ 名称错 |
| `academic_admin_id` | `academic_user_id` | ❌ 名称错 |
| `service_type` | `service_type` | ✅ |
| `amount` | `amount` | ✅ |
| `paid_status` | `paid_status` | ✅（但枚举值不符，见 §3） |
| `order_status` | `order_status` | ✅（但枚举值不符，见 §3） |
| `handover_status` | `handover_status` | ✅（v1.2 新增已就位） |
| `delivery_requirement` | **不存在** | ❌ 字段缺失（实际是 `remark`） |
| `created_at` | `created_at` | ✅ |

### 2.3 影响范围

所有 366 个 TC 中，凡涉及以下 SQL 的都需要改：
- `WHERE operator_id = ?` → `WHERE employee_id = ?`
- `WHERE sales_id = ?` → `WHERE assigned_sales_user_id = ?`（leads）/ `WHERE sales_user_id = ?`（orders）
- `WHERE source_account_id = ?` → `WHERE account_id = ?`
- `WHERE source_post_id = ?` → `WHERE post_id = ?`
- `WHERE deal_status = ?` → 删除该条件（字段不存在）
- `WHERE delivery_requirement = ?` → `WHERE remark = ?`（orders）

---

## 3. 枚举值不匹配 🟡 P1

### 3.1 `leads.status` 期望英文 vs 实际中文

| v1.2 文档期望 | 实际 DB 值 | 命中率 |
| --- | --- | --- |
| `new` | `新客资` | ❌ 0/108 |
| `assigned` | `新客资` | ❌ 0/108 |
| `in_followup` | `新客资` | ❌ 0/108 |
| `in_collaboration` | `新客资` | ❌ 0/108 |
| `operation_handled` | `新客资` | ❌ 0/108 |
| `added_success` | `新客资` | ❌ 0/108 |
| `deal_done` | `新客资` | ❌ 0/108 |
| `invalid` | `新客资` | ❌ 0/108 |

**实际数据**：108 行全部 `新客资`，**没有任何状态机流转过的样例**。

### 3.2 `leads.add_status` 期望 vs 实际

| v1.2 文档期望 | 实际 DB 值 | 命中率 |
| --- | --- | --- |
| `not_added` | `未添加` | ❌ 0/108（值类型不同） |
| `applied` / `not_passed` / `operation_reminded` / `added` / `rejected` | 均无 | ❌ |

**实际数据**：108 行全部 `未添加`（中文）。

### 3.3 `leads.process_status` 期望 vs 实际

| v1.2 文档期望 | 实际 DB 值 | 命中率 |
| --- | --- | --- |
| `not_contacted` | `未接` | ❌ 0/108 |
| `waiting_pass` / `communicating` / `quoted` / `deal_pending` / `deal_done` / `invalid` | 均无 | ❌ |

**实际数据**：108 行全部 `未接`（中文）。

### 3.4 `leads.intention` / `intention_level` / `add_method`

| 字段 | 实际值分布 | 含义 |
| --- | --- | --- |
| `intention` | 108/108 = null | 无任何意向数据 |
| `intention_level` | 108/108 = `pending` | v1.2 文档期望 `high/mid/low` |
| `add_method` | 108/108 = `unknown` | v1.2 文档期望 `passive/active` 等 |

### 3.5 `orders.order_status` / `paid_status`

| 字段 | 实际 enum 字符串 | v1.2 文档期望 | 差异 |
| --- | --- | --- | --- |
| `order_status` | `to_receive/in_progress/awaiting_client_info/awaiting_teacher/to_deliver/completed/abnormal` | `pending_accept/in_progress/waiting_material/waiting_teacher/delivering/completed/abnormal/closed` | ❌ 7 vs 8，且名称全部不匹配（`to_receive` vs `pending_accept`、`awaiting_client_info` vs `waiting_material`、`to_deliver` vs `delivering`），且 `closed` 在 DB 不存在 |
| `paid_status` | `unpaid/partial/paid` | `unpaid/partial_paid/paid/refunded` | ❌ 3 vs 4，且 `partial` vs `partial_paid`、`refunded` 在 DB 不存在 |

### 3.6 影响范围

- 6 个测试文档中所有"WHERE status = 'xxx'"的断言需要从英文改为中文
- 所有"assert items[i].status === 'in_followup'"需改为 `'跟进中'` 或 `'未接'` 等
- 需在测试文档顶部加"枚举值映射表"章节

---

## 4. 业务数据不足 🟡 P1

### 4.1 leads 全部 108 条都是初始状态

```sql
SELECT status, add_status, process_status, COUNT(*) FROM leads GROUP BY ...
-- 结果：所有行 = (新客资, 未添加, 未接)
-- 含义：从未有任何销售跟进 / 协同 / 成交
```

→ **所有状态机用例的"前置数据"无法满足**，必须先准备 fixture 数据（INSERT 不同状态组合的 lead）。

### 4.2 leads.assigned_sales_user_id 全部 NULL

```sql
SELECT COUNT(*) FROM leads WHERE assigned_sales_user_id IS NOT NULL;  -- 0
SELECT COUNT(*) FROM leads WHERE assigned_sales_user_id IS NULL;     -- 108
```

→ **没有任何 lead 分配给销售**，销售端 `GET /api/leads?scope=self` 会返回空数组。必须先 fixture 一些 assigned 给 sales01 / sales_a / sales_b 的 lead。

### 4.3 关键业务表全部 0 行

`orders / order_follow_records / collaboration_tasks / notifications / exports / operation_logs / lead_follow_records / lead_files / favorites / import_tasks / lead_drafts` 全部 0 行。

→ 涉及这些表的测试用例**全部没有种子数据可验证**，必须先 fixture：
- 测试订单交付：INSERT orders（含 handover_status 4 个不同值）
- 测试协同：INSERT collaboration_tasks（含 pending/handling/handled/closed/timeout 5 个状态）
- 测试通知：INSERT notifications（覆盖 12+ type_code）
- 测试导出：INSERT exports（4 种 status）
- 测试操作日志：INSERT operation_logs（15 种 action）
- 测试节点提醒：INSERT order_follow_records（含 next_remind_at 到期数据）

---

## 5. 关联断点 🟡 P1

### 5.1 leads 中 1 条 account_id 失效

```sql
SELECT l.id, l.account_id, l.post_id
FROM leads l LEFT JOIN accounts a ON l.account_id = a.id
WHERE a.id IS NULL OR (l.post_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM posts WHERE id = l.post_id));
```

| lead_id | account_id | post_id | 失效项 |
| --- | --- | --- | --- |
| `lead-23f62cac-9e38-4869-880b-d7f7d6da9d52` | `acc-760c730d-...` | `post-cc7a1ee0-...` | account 和 post 都找不到 |

→ 1 条孤儿 lead（account/post 被删除但 lead 未级联删除），不影响测试但需关注。

### 5.2 users.employee_id 关联丢失

| username | employee_id | 问题 |
| --- | --- | --- |
| `ops_c` | `EMP_OPS_C` | ❌ 找不到（employees 表无此 id 格式） |

→ 已记录。需在 fixture 阶段改为有效的 UUID，或用 `LEFT JOIN` 容忍 NULL。

---

## 6. 缺失表 🔴 P0

### 6.1 `post_metrics` 表不存在

```sql
SHOW TABLES LIKE 'post_metrics';  -- 0 行
```

**影响**：
- 6 个测试文档中 `POST /api/posts/:id/metrics`、`GET /api/posts/:id/metrics`、`post_metrics` 按 `post_id + date` 去重 等用例**无法验证**
- 排行榜"流量榜"按点赞数排名的实现无法验证（需要 post_metrics 数据）
- 学习榜单依赖 post_metrics

**修复建议**：执行 M2 迁移 `M2__post_metrics*.sql`（如果存在）或新建表。

---

## 7. v1.2 已实现字段确认 ✅

| 字段/表 | 状态 | 验证 |
| --- | --- | --- |
| `orders.handover_status` (varchar(16)) | ✅ | 满足 v1.2 §7.1 P0-2 字段契约 |
| `order_follow_records.reminder_sent_at` (datetime) | ✅ | 满足节点提醒幂等 |
| `order_follow_records.next_remind_at` (datetime) | ✅ | 满足节点提醒扫描 |
| `collaboration_tasks.status` 含 `timeout` | ✅ enum('pending','handling','handled','closed','timeout') | 满足 v1.2 §5.2 协同 timeout 状态 |
| `order_abnormal_feedbacks` 独立表 | ✅ | 满足 v1.2 §5.2 异常反馈 |
| `import_tasks.created_at`（无 `create_time`） | ✅ | v1.2 P0 列名错位已修复 |
| `users.role` 含 `academic` | ✅ enum('admin','staff','sales','academic','owner') | v1.2 §5.2 角色扩展已就位 |

---

## 8. 验收文档引用的特定 lead ID 核查

```sql
SELECT id, nickname, status, add_status, source_unknown
FROM leads WHERE id = 'fd8525cd-f7c5-48d5-a158-dcd6a4cb38c7';
-- 结果：0 行（已删除）
```

→ 验收文档 §二、销售端 #1 引用的"乱码 lead"已不存在。可能是被清理过。

---

## 9. leads 字符集脏数据检查

```sql
-- 长度不一致行（UTF-8 中文每字符 3 字节）
SELECT id, nickname, LENGTH(nickname) AS bytes, CHAR_LENGTH(nickname) AS chars
FROM leads WHERE LENGTH(nickname) != CHAR_LENGTH(nickname) LIMIT 10;
-- 结果：10 行
-- 全部是正常中文（3 字节/字符），无 GBK 错转痕迹
```

| lead_id | nickname | bytes | chars | 状态 |
| --- | --- | --- | --- | --- |
| lead-007733a2-... | 流浪~ | 7 | 3 | ✅ 正常中文 |
| lead-021764d5-... | 步履不停的赶路人 | 24 | 8 | ✅ 正常中文 |
| lead-0352cb99-... | 已退姜姜 | 12 | 4 | ✅ 正常中文 |
| ... | ... | ... | ... | ✅ |

→ **未发现验收文档提到的 `?` 替换字符（`���` 之类）**。可能是数据已清理，或当时是浏览器渲染问题。

---

## 10. 修复优先级建议

### 🔴 P0 必修（阻塞测试执行）

1. **修测试文档字段名引用**：把所有 TC 中的 `operator_id / sales_id / source_account_id / source_post_id / deal_status / delivery_requirement` 改为 DB 实际字段
2. **建 `post_metrics` 表**：执行 M2 迁移或新建表
3. **加 enum 映射章节**：在每个测试文档 §0 加"DB 实际枚举 vs 测试假设枚举"对照表

### 🟡 P1 重要（影响断言正确性）

4. **准备 fixture 数据脚本**：
   - `fixture_leads.sql` — 至少 30 条 leads，覆盖 8 个 status 状态 + 6 个 add_status + 7 个 process_status
   - `fixture_orders.sql` — 至少 20 条 orders，覆盖 7 个 order_status + 3 个 paid_status + 4 个 handover_status
   - `fixture_collaboration_tasks.sql` — 至少 10 条，覆盖 5 个 status × 4 个 type
   - `fixture_notifications.sql` — 至少 30 条，覆盖 12+ type_code
   - `fixture_export.sql` — 至少 4 条 exports
   - `fixture_operation_logs.sql` — 至少 15 条
   - `fixture_order_follow_records.sql` — 至少 10 条（用于节点提醒）
5. **修枚举值断言**：把所有 `assert status === 'in_followup'` 改为 `assert status === '跟进中'` 或加 enum 映射
6. **修 `ops_c.employee_id`**：改为有效的 UUID 关联

### 🟢 P3 可选

7. 清理孤儿 lead（1 条）
8. 补全 §10.2 / §10.3 字段契约表（v1.2 文档层面）

---

## 11. 总结

**核心问题**：测试文档基于"v1.2 文档 §10 字段/枚举契约"撰写，但**实际 DB schema 沿用的是 V1 旧契约**，且**实际业务数据量严重不足**（leads 全 108 条都是初始状态、其余业务表全 0 行）。

**影响**：
- 🔴 P0：所有 DB 核对 SQL 大概率跑错（字段名错误）
- 🔴 P0：post_metrics 相关用例无法验证
- 🟡 P1：状态机用例的前置数据缺失，需先准备 fixture
- 🟡 P1：枚举值断言需要从英文改为中文

**下一步**：
1. 修测试文档字段名（影响 366+ 个 TC 的所有 DB 核对 SQL）
2. 加枚举映射章节
3. 编写 fixture SQL 脚本（6 张表）
4. 考虑建 post_metrics 表

---

> 文档结束。共发现 18+ 个问题，其中 P0 阻塞 2 类、P1 影响断言 3 类。
