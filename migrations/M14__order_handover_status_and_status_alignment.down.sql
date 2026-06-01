-- M14 回滚：移除 orders.handover_status 字段（仅在确实需要时执行；会丢失交接状态）
USE lan_dual_role_system;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'handover_status'
);

SET @ddl := IF(
  @col_exists = 1,
  'ALTER TABLE orders
     DROP INDEX idx_orders_handover_status,
     DROP COLUMN handover_status',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
