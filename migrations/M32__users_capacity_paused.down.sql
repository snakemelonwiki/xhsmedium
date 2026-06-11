-- M32 down: 回滚客资容量上限状态字段

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'capacity_paused_at'
);

SET @ddl := IF(
  @col_exists > 0,
  'ALTER TABLE users DROP COLUMN capacity_paused_at',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'capacity_paused'
);

SET @ddl := IF(
  @col_exists > 0,
  'ALTER TABLE users DROP COLUMN capacity_paused',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
