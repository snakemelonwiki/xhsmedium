-- M10 回滚：移除 reminder_sent_at（仅在确实需要时执行；会丢失提醒发送历史）
USE lan_dual_role_system;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_follow_records'
    AND COLUMN_NAME = 'reminder_sent_at'
);

SET @ddl := IF(
  @col_exists = 1,
  'ALTER TABLE order_follow_records
     DROP INDEX idx_order_follow_remind,
     DROP COLUMN reminder_sent_at',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
