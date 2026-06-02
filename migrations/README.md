# 数据库迁移说明

本目录维护 leads/orders/客资协同链路相关的可演进 schema 变更。

## 目录结构

```
migrations/
  M1__leads_extend_fields.up.sql      # 新增字段 + process_status 类型迁移
  M1__leads_extend_fields.down.sql
  M2__leads_backfill.up.sql           # intention/process_status 中文→英文 code
  M2__leads_backfill.down.sql
  README.md                           # 本文档
scripts/
  run-migrations.js                   # 迁移执行器（自带 _migrations 注册表）
  backfill-lead-code.js               # lead_code 历史回填（按 created_at 顺序）
```

## 前置

1. 配置 `.env`，确保 `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` 指向正确的 MySQL 实例。
2. 已执行过 `schema.sql` 完成基础表创建。
3. **执行迁移前停止 server.js 与 backend/ 服务**：避免双写时与新 ENUM 冲突。

```bash
# 临时停止
pm2 stop all   # 或 Ctrl+C 停止本地 npm start
```

## 一次性执行（推荐流程）

```bash
# 1. 应用 M1（schema 改造）
node scripts/run-migrations.js --target=M1

# 2. 应用 M2（中文→英文 code 映射）
node scripts/run-migrations.js --target=M2

# 3. 回填 lead_code（按 created_at 升序生成）
node scripts/backfill-lead-code.js

# 4. 查看迁移状态
node scripts/run-migrations.js --status
```

## 单独执行

```bash
node scripts/run-migrations.js                       # 自动应用所有未应用的 .up.sql
node scripts/run-migrations.js --status              # 列出已应用 / 未应用
node scripts/run-migrations.js --target=M1           # 仅执行 M1 系列
```

## 回滚

```bash
# 先回滚数据，再回滚 schema
node scripts/run-migrations.js --down=M2__leads_backfill
node scripts/run-migrations.js --down=M1__leads_extend_fields

# lead_code 单独清空（M2 回滚已包含）
node scripts/backfill-lead-code.js --force   # 强制重新生成
```

## 字段映射（M2 回填规则）

### intention → intention_level

| 旧值 (intention) | 新值 (intention_level) |
| --- | --- |
| 强意向 | high |
| 中意向 / 了解备用 | mid |
| 弱 / 低意向 | low |
| 无效 | invalid |
| NULL / 其他 | pending |

### process_status_legacy → process_status

| 旧值 | 新值 |
| --- | --- |
| 未接 / 未联系 / NULL | not_contacted |
| 已接 / 已发送申请 | applied |
| 待通过 | pending |
| 已通过 | passed |
| 沟通中 | chatting |
| 已报价 | quoted |
| 已成交 | closed |
| 无效 | invalid |

## 与应用代码同步

执行 M1+M2 后，应用代码必须同步更新默认值（已在本次 PR 一并完成）：

| 文件 | 字段 | 旧默认 | 新默认 |
| --- | --- | --- | --- |
| `repositories.js` | processStatus | "未接" | "not_contacted" |
| `repositories.js` | addMethod | "主动添加" | "unknown" |
| `backend/src/entities/lead.entity.ts` | processStatus | "未接" | "not_contacted" |
| `backend/src/modules/leads/leads.service.ts` | processStatus | "未接" | "not_contacted" |
| `backend/src/modules/leads/leads.controller.ts` | processStatus | "未接" | "not_contacted" |

## 关于 backend/migrations/

`backend/migrations/` **不是** TypeORM 实际跑的目录。本目录（`migrations/`）才是 — 详见 `scripts/run-migrations.js` 第 38 行 `MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')` 与 `backend/migrations/README.md`。

新迁移统一命名 `M<next>__<name>.{up,down}.sql` 放本目录；2026-06-02 起 v1.2 性能 Round 2 索引（9 个复合索引）已并入 `M21__v1_2_perf_indexes_round_2.{up,down}.sql`。

未涉及的字段（M1 不动）：
- `add_status` 默认仍为 "未添加"（VARCHAR）
- `status` 默认仍为 "新客资"
- `intention` 旧字段保留为只读

后续 milestone（M3）再迁移 add_status 与 status。

## 故障排查

### 报错：Column 'add_method' already exists

如果你之前手动跑过 `schema.sql` 末尾的 ALTER（已被本次 PR 清理），那条 ALTER 用的是中文 ENUM。
处理：

```sql
-- 删除旧的中文 ENUM 列，然后重新执行 M1
ALTER TABLE leads DROP COLUMN add_method;
```

### 报错：lead_code 重复

历史数据中存在 created_at 完全相同的多条记录，序号已正确生成不会冲突；
若是手动写入了重复 lead_code，可：

```bash
node scripts/backfill-lead-code.js --force
```

### MySQL 8.0 严格模式 vs 低版本

ENUM 写入非法值时，MySQL 5.7 默认 truncate 为空串，8.0 默认报错。
请确保 `sql_mode` 至少包含 `STRICT_TRANS_TABLES`，避免静默吞错。

```sql
SHOW VARIABLES LIKE 'sql_mode';
```
