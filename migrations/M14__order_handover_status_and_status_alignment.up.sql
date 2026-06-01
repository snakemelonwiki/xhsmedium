-- M14: orders 追加 handover_status 字段，用于销售→教务交接状态机
-- 规则：只新增字段，不动现有 order_status 字段（保持向后兼容）
-- 多次执行幂等（IF NOT EXISTS via INFORMATION_SCHEMA）
-- 文档 1.2 完整版要求的交接状态：pending / handed_over / accepted / rejected
USE lan_dual_role_system;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'handover_status'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE orders
     ADD COLUMN handover_status VARCHAR(16) NOT NULL DEFAULT ''pending''
       COMMENT ''交接状态: pending待交接 | handed_over已交接 | accepted已接收 | rejected已拒收'',
     ADD INDEX idx_orders_handover_status (handover_status)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
