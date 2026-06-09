-- M31 down: 回滚主管作品质量状态字段

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND INDEX_NAME = 'idx_posts_quality_status'
);

SET @ddl := IF(
  @idx_exists > 0,
  'DROP INDEX idx_posts_quality_status ON posts',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND COLUMN_NAME = 'supervisor_quality_marked_at'
);

SET @ddl := IF(
  @col_exists > 0,
  'ALTER TABLE posts DROP COLUMN supervisor_quality_marked_at',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND COLUMN_NAME = 'supervisor_quality_marked_by'
);

SET @ddl := IF(
  @col_exists > 0,
  'ALTER TABLE posts DROP COLUMN supervisor_quality_marked_by',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND COLUMN_NAME = 'supervisor_quality_status'
);

SET @ddl := IF(
  @col_exists > 0,
  'ALTER TABLE posts DROP COLUMN supervisor_quality_status',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
