-- M10: order_follow_records 追加 reminder_sent_at 字段，用于节点提醒幂等
-- 规则：只新增字段，不改原字段类型；多次执行幂等（IF NOT EXISTS via INFORMATION_SCHEMA）
USE lan_dual_role_system;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_follow_records'
    AND COLUMN_NAME = 'reminder_sent_at'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE order_follow_records
     ADD COLUMN reminder_sent_at DATETIME NULL COMMENT ''节点提醒已发送时间(NULL=未发送)'',
     ADD INDEX idx_order_follow_remind (next_remind_at, reminder_sent_at)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
