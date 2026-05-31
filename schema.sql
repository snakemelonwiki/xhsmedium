CREATE DATABASE IF NOT EXISTS lan_dual_role_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lan_dual_role_system;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff') NOT NULL,
  employee_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(64) PRIMARY KEY,
  employee_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  phone VARCHAR(64) NULL,
  hire_date DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT '在职',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  profile_url VARCHAR(500) NULL,
  account_name VARCHAR(128) NOT NULL,
  account_uid VARCHAR(128) NULL,
  persona VARCHAR(255) NULL,
  positioning VARCHAR(255) NULL,
  posting_plan TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT '正常',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_accounts_employee_id (employee_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  copywriting TEXT NULL,
  cover_image_url VARCHAR(500) NULL,
  post_url VARCHAR(500) NULL,
  post_type VARCHAR(32) NOT NULL,
  traffic BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  favorites BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  metrics_updated_at DATETIME NULL,
  published_at DATE NOT NULL,
  note TEXT NULL,
  supervisor_suggestion TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_employee_id (employee_id),
  INDEX idx_posts_account_id (account_id),
  INDEX idx_posts_published_at (published_at)
);

CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(64) PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  post_id VARCHAR(64) NULL,
  platform VARCHAR(32) NOT NULL,
  contact_info VARCHAR(255) NOT NULL,
  nickname VARCHAR(128) NULL,
  budget VARCHAR(64) NULL,
  major_content VARCHAR(255) NULL,
  ip VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT '新客资',
  deal_amount DECIMAL(12,2) NULL,
  note TEXT NULL,
  capture_image_url VARCHAR(500) NULL,
  sales_feedback TEXT NULL,
  sales_updated_at DATETIME NULL,
  sales_user_name VARCHAR(64) NULL,
  assigned_sales_user_id VARCHAR(64) NULL,
  assigned_sales_user_name VARCHAR(64) NULL,
  process_status VARCHAR(32) NOT NULL DEFAULT '未接',
  add_status VARCHAR(32) NOT NULL DEFAULT '未添加',
  intention VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_employee_id (employee_id),
  INDEX idx_leads_account_id (account_id),
  INDEX idx_leads_created_at (created_at)
);

-- v1.0 问题修复版新增表（开发者A：内容运营与管理域）
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
);

CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fav_user_target (user_id, target_type, target_id),
  INDEX idx_fav_user (user_id),
  INDEX idx_fav_target (target_type, target_id)
);

CREATE TABLE IF NOT EXISTS import_tasks (
  id VARCHAR(64) PRIMARY KEY,
  import_type VARCHAR(16) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(64) NULL,
  total_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  error_file_url VARCHAR(500) NULL,
  error_detail JSON NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'excel',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_import_user (user_id),
  INDEX idx_import_type (import_type),
  INDEX idx_import_created (create_time)
);

CREATE TABLE IF NOT EXISTS lead_follow_records (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  follow_type VARCHAR(32) DEFAULT '微信',
  content TEXT NULL,
  next_follow_time DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_follow_lead_id (lead_id),
  INDEX idx_follow_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS lead_drafts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  draft_type VARCHAR(32) NOT NULL COMMENT 'leads/posts等',
  content_json TEXT NOT NULL,
  image_urls JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_drafts_user_id (user_id)
);

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
);

CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL COMMENT 'post/account',
  target_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fav_user_id (user_id),
  UNIQUE KEY idx_fav_user_target (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS import_tasks (
  id VARCHAR(64) PRIMARY KEY,
  import_type VARCHAR(32) NOT NULL COMMENT 'leads/posts',
  user_id VARCHAR(64) NOT NULL,
  success_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  error_file_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_import_user_id (user_id)
);

-- ============================================================
-- 注意：leads 表的 M1+ 字段（lead_code / intention_level / process_status(ENUM) /
-- add_method / next_follow_time / matched_post_id / source_unknown）由
-- migrations/ 目录下的迁移文件维护，不再在此处 ALTER。
-- 新建数据库流程：先执行本文件，然后：
--   node scripts/run-migrations.js
--   node scripts/backfill-lead-code.js
-- ============================================================
