-- ============================================================
-- M46 down: order_finance 回滚 expense 字段
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE order_finance DROP COLUMN IF EXISTS expense;
