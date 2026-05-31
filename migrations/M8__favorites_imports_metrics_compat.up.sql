-- M8: compatibility columns for high-priority collaboration features.
-- MySQL 5.7-compatible idempotent migration.

SET @db_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE favorites ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'favorites' AND COLUMN_NAME = 'created_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE import_tasks ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'created_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE import_tasks ADD COLUMN finished_at DATETIME NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'finished_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE import_tasks ADD COLUMN error_file_url VARCHAR(500) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'error_file_url'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE import_tasks ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''done''',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS post_metrics_history (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  favorites BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  leads_count BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_history_post_id (post_id),
  INDEX idx_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品指标历史';
