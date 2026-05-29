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
