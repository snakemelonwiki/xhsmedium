# backend/migrations/

> 临时调试 SQL 区域

TypeORM 实际跑的迁移目录是**仓库根目录的 [`migrations/`](../migrations/README.md)**，
由 `scripts/run-migrations.js:38` 的 `MIGRATIONS_DIR` 常量指定。

本目录（`backend/migrations/`）**不**被 TypeORM 读取，仅供：
- 后端模块联调时的临时 SQL 验证
- 修复单条数据的运维脚本
- 与根 `migrations/` 历史重名/冲突时的备份

## 使用规则

- 新建正式迁移**必须**放在根 [`migrations/`](../migrations/)，命名 `M<number>__<name>.{up,down}.sql`
- 本目录文件不会随 `npm run migration:run` 执行
- 上线前请清理本目录的过期脚本

## 当前文件

| 文件 | 用途 | 状态 |
| --- | --- | --- |
| `add-p1-exports-indexes.sql` | 导出模块 P1 阶段临时性能索引验证 | 临时/待清理 |
| `add-performance-indexes.sql` | 通用性能索引临时验证 | 临时/待清理 |
| `check-d-p1-01-leads-charset.sql` | leads 表字符集检查脚本 | 临时/待清理 |
| `fix-d-p1-02-orphan-leads.sql` | 孤立客资数据修复脚本 | 临时/待清理 |
| `add-scraping-alerts-table.sql` | 抓取告警表 scraping_alerts DDL（v1.4 全局抓取锁 + 失败告警入库改造） | 正式/已纳入 |
