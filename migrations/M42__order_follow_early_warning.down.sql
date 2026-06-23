-- ============================================================
-- M42 回滚：删除 order_follow_records 提前预警字段
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE order_follow_records DROP COLUMN IF EXISTS early_warning_sent_at;
ALTER TABLE order_follow_records DROP COLUMN IF EXISTS enable_early_warning;

SET FOREIGN_KEY_CHECKS = 1;
