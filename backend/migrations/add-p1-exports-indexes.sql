-- ============================================================
-- B 端 1.2 P1 修复 - exports 表性能索引（E/P1-05）
--
-- 背景：测试报告（doc/B端-测试执行结果-导出.md）指出
--   `EXPLAIN SELECT * FROM exports WHERE user_id='xxx' ORDER BY created_at DESC LIMIT 20`
--   当前 type=ALL + Using filesort，因为现存的 `idx_exports_user(user_id)` 是单列索引，
--   而 ORDER BY 走 created_at 没法直接用单列 user_id 索引完成"按 user 过滤后按时间排序"。
--   数据量小（24 行）时 MySQL 优化器选择全表扫描，问题不明显；>10K 行时会显著变慢。
--
-- 修复：
--   1) 新增复合索引 `idx_exports_user_created (user_id, created_at)`，
--      让"按 user 过滤 + 按 created_at 排序"走索引一次完成。
--   2) 同时新增 `idx_exports_user_type_created (user_id, export_type, created_at)`，
--      覆盖 1 分钟防抖（E/P1-03）里"按 user_id + export_type 查 1 分钟内最新任务"的查询路径。
--   3) 保留原有 `idx_exports_user / idx_exports_status / idx_exports_created_at`，
--      供其它路径（如按状态过滤、按 created_at 全表扫描 GC）继续使用。
--
-- 兼容性：所有 ALTER 走 INFORMATION_SCHEMA 探测 + 动态 SQL，
--   在已建过索引的环境上多次执行也是幂等的（MySQL 8.0.29+ 原生支持
--   `ALTER TABLE ... ADD INDEX IF NOT EXISTS`，本脚本同时支持 5.7/8.0 低版本）。
-- ============================================================

USE lan_dual_role_system;

-- idx_exports_user_created
SET @has_idx_user_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exports'
    AND INDEX_NAME = 'idx_exports_user_created'
);
SET @sql := IF(@has_idx_user_created = 0,
  'ALTER TABLE exports ADD INDEX idx_exports_user_created (user_id, created_at)',
  'SELECT ''idx_exports_user_created exists'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- idx_exports_user_type_created (覆盖 E/P1-03 1 分钟防抖)
SET @has_idx_user_type_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exports'
    AND INDEX_NAME = 'idx_exports_user_type_created'
);
SET @sql := IF(@has_idx_user_type_created = 0,
  'ALTER TABLE exports ADD INDEX idx_exports_user_type_created (user_id, export_type, created_at)',
  'SELECT ''idx_exports_user_type_created exists'' AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证
SHOW INDEX FROM exports
WHERE Key_name IN (
  'idx_exports_user',
  'idx_exports_status',
  'idx_exports_created_at',
  'idx_exports_user_created',
  'idx_exports_user_type_created'
);
