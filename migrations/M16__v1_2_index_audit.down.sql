-- ============================================================
-- M16 回滚：v1.2 索引复核
-- 仅在确认业务查询模式回退到无这些索引也可接受时执行
-- 对应顺序与 up.sql 一致（倒序删除即可，单表独立）
-- ============================================================

USE lan_dual_role_system;

-- 1. order_abnormal_feedbacks
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_abnormal_feedbacks'
    AND INDEX_NAME = 'idx_oaf_created_at'
);
SET @ddl := IF(
  @idx_exists = 1,
  'ALTER TABLE order_abnormal_feedbacks DROP INDEX idx_oaf_created_at',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. order_follow_records
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_follow_records'
    AND INDEX_NAME = 'idx_order_follow_created_at'
);
SET @ddl := IF(
  @idx_exists = 1,
  'ALTER TABLE order_follow_records DROP INDEX idx_order_follow_created_at',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. collaboration_tasks
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'collaboration_tasks'
    AND INDEX_NAME = 'idx_collab_created_at'
);
SET @ddl := IF(
  @idx_exists = 1,
  'ALTER TABLE collaboration_tasks DROP INDEX idx_collab_created_at',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. orders
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_paid_status'
);
SET @ddl := IF(
  @idx_exists = 1,
  'ALTER TABLE orders DROP INDEX idx_orders_paid_status',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
