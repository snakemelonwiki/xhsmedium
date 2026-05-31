-- v1.0 问题修复版 增量 DDL（开发者A：内容运营与管理域）
-- 适配线上 schema.sql 约定：VARCHAR(64) UUID 主键、utf8mb4
-- 新表统一带 deleted 逻辑删除标记 + create_time + update_time
-- 可对现有库重复执行（IF NOT EXISTS / 列存在性判断）
USE lan_dual_role_system;

-- #8 作品手动刷新：posts 增加转发数列（实体原本只有 likes/comments/favorites）
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'shares'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE posts ADD COLUMN shares BIGINT NOT NULL DEFAULT 0 AFTER favorites',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- #8 作品手动刷新：刷新历史，用于趋势查看
CREATE TABLE IF NOT EXISTS post_metrics_history (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  favorites BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  leads_count BIGINT NOT NULL DEFAULT 0,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pmh_post_id (post_id),
  INDEX idx_pmh_captured_at (captured_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- #9 收藏：作品/账号收藏（个人维度），主管可看总收藏次数
CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,          -- post / account
  target_id VARCHAR(64) NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fav_user_target (user_id, target_type, target_id),
  INDEX idx_fav_user (user_id),
  INDEX idx_fav_target (target_type, target_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- #7 批量导入：导入任务记录，主管端可查谁导入/总数/成功/失败；失败行文件地址写入 error_file_url
CREATE TABLE IF NOT EXISTS import_tasks (
  id VARCHAR(64) PRIMARY KEY,
  import_type VARCHAR(16) NOT NULL,          -- post / lead
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(64) NULL,
  total_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  error_file_url VARCHAR(500) NULL,
  error_detail JSON NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'excel', -- excel / paste
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_import_user (user_id),
  INDEX idx_import_type (import_type),
  INDEX idx_import_created (create_time)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
