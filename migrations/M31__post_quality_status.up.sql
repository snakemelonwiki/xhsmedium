-- M31: 主管作品质量状态
-- normal: 普通；excellent: 优秀作品；unqualified: 不合格作品，关联客资成单按半价入单。

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND COLUMN_NAME = 'supervisor_quality_status'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE posts ADD COLUMN supervisor_quality_status VARCHAR(16) NOT NULL DEFAULT ''normal'' COMMENT ''主管质量状态：normal/excellent/unqualified''',
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
  @col_exists = 0,
  'ALTER TABLE posts ADD COLUMN supervisor_quality_marked_by VARCHAR(64) NULL COMMENT ''最近一次标记质量状态的主管用户ID''',
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
  @col_exists = 0,
  'ALTER TABLE posts ADD COLUMN supervisor_quality_marked_at DATETIME NULL COMMENT ''最近一次标记质量状态的时间''',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE posts
SET supervisor_quality_status = 'excellent'
WHERE is_supervisor_picked = 1
  AND (supervisor_quality_status IS NULL OR supervisor_quality_status = 'normal');

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'posts'
    AND INDEX_NAME = 'idx_posts_quality_status'
);

SET @ddl := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_posts_quality_status ON posts (supervisor_quality_status)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
