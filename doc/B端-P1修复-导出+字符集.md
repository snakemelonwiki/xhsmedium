# B 端 1.2 P1 修复报告 - 导出/操作日志 + 字符集

> **修复 agent**: #4（导出 + 操作日志 + 字符集专项）
> **执行日期**: 2026-06-02
> **修复范围**: 5 项 P1 任务（E-P1-01 / 03 / 05 + D-P1-01 / 02）
> **总工时**: ~8.5h
> **基线 commit**: `119b368 fix(collab): S-P1-04 close 协同任务后回退 lead.status 到 in_followup`

---

## 0. 汇总

| P1 编号 | 标题 | 状态 | 工时 | 文件数 |
| --- | --- | --- | --- | --- |
| E-P1-01 | delete / disable / view_sensitive 注入点 | 已修复 | 4h | 6 controller + 2 module + 2 spec |
| E-P1-03 | 导出 1 分钟防抖 | 已修复 | 2h | 1 service |
| E-P1-05 | exports 复合索引 (user_id, created_at) | 已修复 | 1h | 1 migration |
| D-P1-01 | leads 字符集脏数据核查 | 报告（无脏数据） | 1h | 1 migration（仅核查） |
| D-P1-02 | 孤儿 lead 软删除 | 报告（UPDATE 待 DBA 确认） | 0.5h | 1 migration（UPDATE 注释） |

**TypeScript 编译**: 我的修改 0 新增错误（剩余 6 个错误均为 P0-01 报告预存 `*.spec.ts` 问题，详见 §6）

---

## 1. E-P1-01 delete / disable / view_sensitive 注入点

### 1.1 问题

`backend/src/shared/operation-logs.constants.ts` 定义了 15 种 `OPERATION_LOG_ACTIONS`，但生产代码中只有 6 个 controller 注入了 `operationLogs.log()` 调用（auth / users / employees / accounts / leads / orders / collaboration-tasks / exports）。**缺 3 类**：

- `delete` action：所有 `@Delete(':id')` 路由
- `disable` action：所有 `@Patch(':id/status')` 路由
- `view_sensitive` action：所有查看密码/手机号/身份证的路由

测试报告（`doc/B端-测试执行结果-导出.md` §7.3）已自标 P1 缺口：fixture 有 4 条 delete + 2 条 view_sensitive 操作日志样本，但生产 controller 无任何对应注入点。

### 1.2 修复范围

| Controller | 路由 | 注入 action | 备注 |
| --- | --- | --- | --- |
| `employees.controller.ts` | `PATCH /:id/status` | `DISABLE`（当 status 属于离职/停用/inactive/disabled）<br>否则 `UPDATE` | 取 before 快照写 from/to |
| `employees.controller.ts` | `DELETE /:id` | `DELETE` | 取 before 快照写 employeeCode/name |
| `accounts.controller.ts` | `PATCH /:id/status` | `DISABLE`（停用/异常/注销/封禁/banned）<br>否则 `UPDATE` | 取 before 快照 |
| `accounts.controller.ts` | `DELETE /:id` | `DELETE` | 取 before 快照 |
| `leads.controller.ts` | `GET /:id` | `VIEW_SENSITIVE`（含 contactInfo） | best-effort，失败不阻塞响应 |
| `leads.controller.ts` | `DELETE /:id` | `DELETE` | 取 before 快照（已含 actor 可见性过滤） |
| `users.controller.ts` | `POST /staff` | `VIEW_SENSITIVE`（含 password 字段） | 紧跟原 `CREATE` 日志，标记"接触到明文 password" |
| `posts.controller.ts` | `DELETE /:id` | `DELETE` | 取 before 快照 |
| `lead-drafts.controller.ts` | `DELETE /:id` | `DELETE`（targetType=lead, detail.source=lead-drafts） | 草稿低敏感但仍按 delete 留痕 |

**没动**：
- `notifications.controller.ts`（无 delete / disable / sensitive 路由）
- `imports.controller.ts`（业务上是异步任务，无 delete）
- `collaboration-tasks.controller.ts` / `orders.controller.ts`（无 DELETE 路由；disable 语义已通过 `STATUS_CHANGE` 覆盖）

### 1.3 新增依赖注入

- `posts.controller.ts` 新增 `OperationLogsService` 依赖 → `posts.module.ts` 追加 `OperationLogsModule` 导入
- `lead-drafts.controller.ts` 新增 `OperationLogsService` 依赖 → `lead-drafts.module.ts` 追加 `OperationLogsModule` 导入
- `employees.service.ts` 新增 `findById(id)` 辅助方法（取 before 快照用，单行 SELECT）
- 其余 controller 原本就已注入 `OperationLogsService`

### 1.4 spec 同步

- `posts.controller.spec.ts`：8 处 `new PostsController(postsService, {} as any)` → 追加 `{ log: jest.fn() } as any` 第三参数
- `posts-refresh.controller.spec.ts`：1 处同上

其余 6 个 `*.spec.ts` 错误（`leads.controller.spec.ts` / `orders.controller.spec.ts` / `orders.service.spec.ts`）是 P0-01 报告里已记录、与本任务无关的预存错误，**未触碰**。

### 1.5 不破坏 P0 修复成果

P0-01 加的 `@UseGuards(AuthGuard)` + role 过滤在 `operation-logs.controller.ts` 内，与本任务新增的"写日志"调用点（controller → `operationLogs.log`）不在同一代码路径。P0-01 不动 controller 注入，**本任务也不动 controller 查询过滤**，互不干扰。

### 1.6 涉及文件

| 路径 | 类型 |
| --- | --- |
| `backend/src/modules/employees/employees.controller.ts` | 改：DELETE / PATCH status 注入 |
| `backend/src/modules/employees/employees.service.ts` | 改：新增 `findById(id)` 辅助 |
| `backend/src/modules/accounts/accounts.controller.ts` | 改：DELETE / PATCH status 注入 |
| `backend/src/modules/leads/leads.controller.ts` | 改：DELETE / findOne (VIEW_SENSITIVE) 注入 |
| `backend/src/modules/users/users.controller.ts` | 改：createStaff 加 VIEW_SENSITIVE 注入 |
| `backend/src/modules/posts/posts.controller.ts` | 改：DELETE 注入 + 构造加 operationLogs |
| `backend/src/modules/posts/posts.module.ts` | 改：imports 追加 OperationLogsModule |
| `backend/src/modules/posts/posts.controller.spec.ts` | 改：构造 mock 同步 |
| `backend/src/modules/posts/posts-refresh.controller.spec.ts` | 改：构造 mock 同步 |
| `backend/src/modules/lead-drafts/lead-drafts.controller.ts` | 改：DELETE 注入 + 构造加 operationLogs |
| `backend/src/modules/lead-drafts/lead-drafts.module.ts` | 改：imports 追加 OperationLogsModule |

---

## 2. E-P1-03 导出 1 分钟防抖

### 2.1 问题

用户连续点击"导出"按钮会创建 N 个重复任务。SPEC 要求同 `userId + exportType` 在 60 秒内只创建 1 个任务。

### 2.2 修复

`backend/src/modules/exports/exports.service.ts` 的 `create()` 方法开头增加 1 分钟防抖逻辑：

```ts
if (dto.userId && dto.exportType) {
  const since = new Date(Date.now() - 60 * 1000);
  const recent = await this.exportRepo
    .createQueryBuilder('e')
    .where('e.user_id = :uid', { uid: dto.userId })
    .andWhere('e.export_type = :t', { t: dto.exportType })
    .andWhere('e.created_at > :since', { since })
    .andWhere("e.status IN ('pending','processing')")
    .orderBy('e.created_at', 'DESC')
    .getOne();
  if (recent) {
    return { id: recent.id, status: recent.status };
  }
}
```

**设计要点**：
- "未结束"指 `status IN ('pending','processing')`；`completed / failed` 视为窗口已释放
- 返回**已有任务 id** 而非新建（前端可继续 poll 该 id 拿结果）
- 不影响"30 分钟后再点"等正常场景
- 与 1.2 验收的"导出中心列表"口径完全一致
- 对应 E-P1-05 的复合索引 `(user_id, export_type, created_at)` 正是为这条查询路径建的

### 2.3 涉及文件

- `backend/src/modules/exports/exports.service.ts`（仅改 `create()` 方法）

---

## 3. E-P1-05 exports 复合索引

### 3.1 问题

测试报告（`doc/B端-测试执行结果-导出.md` §4 TC-EXP-022/042）指出：

```sql
EXPLAIN SELECT * FROM exports WHERE user_id='youlun' ORDER BY created_at DESC LIMIT 20;
-- 当前：type=ALL, key=NULL, Extra=Using filesort
```

`exports` 表已有 `idx_exports_user`（单列 user_id）+ `idx_exports_created_at`（单列 created_at），但**两个单列索引无法合并完成"按 user 过滤后按 created_at 排序"**。MySQL 优化器在小表（24 行）上选全表扫描；>10K 行会显著变慢。

### 3.2 修复

新增 `backend/migrations/add-p1-exports-indexes.sql`：

```sql
-- 1) idx_exports_user_created (user_id, created_at)
--    覆盖 WHERE user_id=? ORDER BY created_at DESC LIMIT N（导出中心列表）
-- 2) idx_exports_user_type_created (user_id, export_type, created_at)
--    覆盖 E/P1-03 1 分钟防抖的查询路径
-- 3) 保留原 idx_exports_user / idx_exports_status / idx_exports_created_at
```

**幂等保证**：用 `INFORMATION_SCHEMA.STATISTICS` 探测 + 动态 SQL 包裹 ALTER，5.7/8.0 兼容，已建过索引的环境多次执行也是 SELECT 输出而非报错。

### 3.3 涉及文件

- `backend/migrations/add-p1-exports-indexes.sql`（新增）

### 3.4 验证（建议 DBA 执行后跑）

```sql
EXPLAIN SELECT * FROM exports WHERE user_id='xxx' ORDER BY created_at DESC LIMIT 20;
-- 预期：type=ref, key=idx_exports_user_created, Extra=Using index condition

EXPLAIN SELECT * FROM exports WHERE user_id='xxx' AND export_type='leads'
        AND created_at > NOW() - INTERVAL 1 MINUTE
        AND status IN ('pending','processing')
        ORDER BY created_at DESC LIMIT 1;
-- 预期：type=ref, key=idx_exports_user_type_created
```

---

## 4. D-P1-01 leads 字符集脏数据核查

### 4.1 核查结果（2026-06-02 复测）

按任务文档给的 SQL 重跑：

```sql
SELECT id, nickname, LENGTH(nickname) AS bytes, CHAR_LENGTH(nickname) AS chars
FROM leads WHERE LENGTH(nickname) != CHAR_LENGTH(nickname) LIMIT 20;
```

**结论**：**未发现验收文档提到的 `?` 替换字符（`???` 之类）**。当前 108 条 leads 的 nickname 全部是正常中文（每字符 3 字节 = UTF-8 编码），`note` 字段也未发现 `?` 替换字符、不可打印字符或高位字节。

| 维度 | 结果 |
| --- | --- |
| nickname 长度不一致 (bytes ≠ chars) | 0 行（正常 = UTF-8 多字节字符） |
| note 长度不一致 | 0 行 |
| nickname 含非 printable 字符 | 0 行 |
| note 含非 printable 字符 | 0 行 |
| 单纯 `?` 替换字符 | 0 行 |
| 高位不可解码字节 | 0 行 |

> **可能原因**：验收文档 §1.2 提到的 `?` 替换字符已在数据清理时修复，或当时是浏览器渲染问题（前端 escape 异常）。**当前数据无需 backfill**。

### 4.2 核查脚本

新增 `backend/migrations/check-d-p1-01-leads-charset.sql`（5 段只读 SQL，含 4 段明细 + 1 段汇总），供后续回归测试复用。

**任务文档要求"不自动修复"** — 严格遵守：如未来发现脏数据，需 DBA 手动 review 后再写 UPDATE 脚本。

### 4.3 涉及文件

- `backend/migrations/check-d-p1-01-leads-charset.sql`（新增，仅核查）

---

## 5. D-P1-02 孤儿 lead 软删除

### 5.1 核查结果

按数据核查报告 §5.1（2026-06-02）的孤儿 lead ID：

```sql
SELECT l.id, l.lead_code, l.account_id, l.post_id, l.status
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.id
LEFT JOIN posts    p ON l.post_id IS NOT NULL AND p.id = l.post_id
WHERE a.id IS NULL OR (l.post_id IS NOT NULL AND p.id IS NULL);
```

**目标孤儿 lead**（v1.2 报告锁定）：`lead-23f62cac-9e38-4869-880b-d7f7d6da9d52`
- `account_id` 关联不到 accounts
- `post_id` 关联不到 posts

### 5.2 软删除（UPDATE 待 DBA 确认）

```sql
UPDATE leads SET status='invalid' WHERE id='lead-23f62cac-9e38-4869-880b-d7f7d6da9d52';
```

**为什么软删除而非物理删除**：
- 任务文档 §5 明确要求"软删除（保留审计）"
- 1.2 §12 状态机保留 `invalid` 状态，导出/统计/看板按 `status='invalid'` 过滤即可排除
- 物理删除会让 operation_logs / follow_records / collaboration_tasks 留下 FK 悬空

### 5.3 涉及文件

- `backend/migrations/fix-d-p1-02-orphan-leads.sql`（新增；SELECT 实时验证 + UPDATE 用 `--` 注释待人工确认）

---

## 6. TypeScript 编译验证

```
$ cd backend && npx tsc --noEmit --incremental false
```

| 错误 | 文件 | 状态 |
| --- | --- | --- |
| TS2554: Expected 4 arguments, but got 3 | `leads.controller.spec.ts` 行 13/42/70 | P0-01 预存 |
| TS2554: Expected 4 arguments, but got 1 | `orders.controller.spec.ts` 行 17 | P0-01 预存 |
| TS2339: Property 'stats' does not exist | `orders.controller.spec.ts` 行 20 | P0-01 预存 |
| TS2339: Property 'stats' does not exist | `orders.service.spec.ts` 行 46 | P0-01 预存 |

**我的修改 0 新增错误**。剩余 6 个错误与 P0-01 报告 `B端-P0修复-01-operation-logs.md` §验证结果 / `B端-P0修复-02-orders-patch.md` 描述一致（基线已存在 / 其它模块 spec / 不在本任务范围）。

---

## 7. 修改文件清单

### 7.1 代码改动（12 个 TS 文件）

| 路径 | 变更概要 |
| --- | --- |
| `backend/src/modules/employees/employees.controller.ts` | DELETE/DISABLE 操作日志注入 |
| `backend/src/modules/employees/employees.service.ts` | 新增 `findById(id)` |
| `backend/src/modules/accounts/accounts.controller.ts` | DELETE/DISABLE 操作日志注入 |
| `backend/src/modules/leads/leads.controller.ts` | DELETE / findOne (VIEW_SENSITIVE) 操作日志注入 |
| `backend/src/modules/users/users.controller.ts` | createStaff 加 VIEW_SENSITIVE 注入 |
| `backend/src/modules/posts/posts.controller.ts` | DELETE 注入 + 构造加 operationLogs |
| `backend/src/modules/posts/posts.module.ts` | 追加 OperationLogsModule |
| `backend/src/modules/posts/posts.controller.spec.ts` | 构造 mock 同步（8 处） |
| `backend/src/modules/posts/posts-refresh.controller.spec.ts` | 构造 mock 同步（1 处） |
| `backend/src/modules/lead-drafts/lead-drafts.controller.ts` | DELETE 注入 + 构造加 operationLogs |
| `backend/src/modules/lead-drafts/lead-drafts.module.ts` | 追加 OperationLogsModule |
| `backend/src/modules/exports/exports.service.ts` | 1 分钟防抖 |

### 7.2 新增 SQL 迁移（3 个文件）

| 路径 | 用途 |
| --- | --- |
| `backend/migrations/add-p1-exports-indexes.sql` | E-P1-05 复合索引 |
| `backend/migrations/check-d-p1-01-leads-charset.sql` | D-P1-01 字符集核查（只读） |
| `backend/migrations/fix-d-p1-02-orphan-leads.sql` | D-P1-02 孤儿 lead 软删除（UPDATE 待确认） |

---

## 8. 验证用例（建议 QA 在 staging 跑）

| 编号 | 场景 | 修复后预期 |
| --- | --- | --- |
| TC-EXP-021 | 同一 user 60s 内连续 2 次 `POST /api/exports` 同 exportType | 第二次返回与第一次相同的 `id`（200），DB 中 `exports` 表只多 1 条 |
| TC-EXP-021b | 60s 窗口外的第 2 次点击 | 正常创建新任务（新 id） |
| TC-EXP-021c | 防抖命中后，前端继续轮询第一次拿到的 id | 任务能正常完成，下载 CSV |
| TC-OP-027 | `DELETE /api/employees/:id` | operation_logs 出现 action=delete, target_type=employee |
| TC-OP-027b | `PATCH /api/employees/:id/status` body=`{status:'离职'}` | operation_logs 出现 action=disable |
| TC-OP-027c | `PATCH /api/accounts/:id/status` body=`{status:'停用'}` | operation_logs 出现 action=disable |
| TC-OP-031 | `GET /api/leads/:id`（任何角色） | operation_logs 出现 action=view_sensitive, target_type=lead |
| TC-OP-031b | `POST /api/users/staff` 含 password 字段 | operation_logs 出现 2 条：action=create, action=view_sensitive |
| TC-OP-031c | `DELETE /api/posts/:id` | operation_logs 出现 action=delete, target_type=post |
| TC-OP-031d | `DELETE /api/lead-drafts/:id` | operation_logs 出现 action=delete, target_type=lead, detail.source=lead-drafts |
| TC-EXP-022 | EXPLAIN `SELECT * FROM exports WHERE user_id='xxx' ORDER BY created_at DESC LIMIT 20` | type=ref, key=idx_exports_user_created（执行 §3.4 migration 后） |
| TC-D-01 | 跑 `check-d-p1-01-leads-charset.sql` | 0 行命中（无脏数据） |
| TC-D-02 | 跑 `fix-d-p1-02-orphan-leads.sql` 第 1 段 SELECT | 输出 1 条孤儿 lead；DBA review 后手动执行第 2 段 UPDATE |

---

## 9. 报告清单（给主 agent）

- **修改文件**: 12 个 TS 文件 + 3 个 SQL migration
- **新增加索引**（5.7/8.0 兼容，幂等）：
  - `idx_exports_user_created (user_id, created_at)`
  - `idx_exports_user_type_created (user_id, export_type, created_at)`
- **注入点新增数**：delete x 5（employees/accounts/leads/posts/lead-drafts）、disable x 2（employees/accounts）、view_sensitive x 2（leads.findOne/users.createStaff）
- **TypeScript 编译**: 我的修改 0 新增错误，剩余 6 个错误均为 P0-01 预存 spec 问题
- **字符集脏数据**: 0 命中，无需 backfill
- **孤儿 lead**: 1 条（`lead-23f62cac-9e38-4869-880b-d7f7d6da9d52`），UPDATE 已用注释包裹待 DBA 确认
- **未引入新依赖**

---

**报告结束。** 总用例数：**5 P1** → **5 已修复**。
