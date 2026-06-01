-- ============================================================
-- M16: v1.2 索引复核 (P2-B 性能底座)
-- 文档 1.2 §5.2 / §8.4 P2-B：根据业务高频查询补齐缺失索引
-- 已存在索引复核（见 schema.sql）后，本迁移只补 4 个缺失：
--   1. orders.paid_status        销售端按"是否已付款"过滤
--   2. collaboration_tasks.created_at 协同任务按时间排序/统计
--   3. order_follow_records.created_at 订单跟进时间线
--   4. order_abnormal_feedbacks.created_at 异常反馈时间维度
--
-- 对应服务：
--   backend/src/modules/orders/orders.service.ts
--   backend/src/modules/orders/orders.controller.ts
--   backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts
--   backend/src/modules/orders/order-abnormal-feedback.service.ts
-- ============================================================

USE lan_dual_role_system;

-- ---------- 1. orders.paid_status ----------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_paid_status'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE orders ADD INDEX idx_orders_paid_status (paid_status)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- 2. collaboration_tasks.created_at ----------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'collaboration_tasks'
    AND INDEX_NAME = 'idx_collab_created_at'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE collaboration_tasks ADD INDEX idx_collab_created_at (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- 3. order_follow_records.created_at ----------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_follow_records'
    AND INDEX_NAME = 'idx_order_follow_created_at'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE order_follow_records ADD INDEX idx_order_follow_created_at (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- 4. order_abnormal_feedbacks.created_at ----------
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_abnormal_feedbacks'
    AND INDEX_NAME = 'idx_oaf_created_at'
);
SET @ddl := IF(
  @idx_exists = 0,
  'ALTER TABLE order_abnormal_feedbacks ADD INDEX idx_oaf_created_at (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
