-- ============================================================
-- M4: 修复 lead_follow_records / lead_files 的 BIGINT 旧表
--   背景：M3 的 IF NOT EXISTS 没能改造这两张 ddl/03 留下的旧表，
--         它们 id/lead_id/sales_id/uploaded_by 都是 BIGINT，
--         与全局 VARCHAR(64) UUID 风格不兼容（NestJS 写不进去）。
--   已确认两表为空，安全 DROP 重建。
--   - lead_follow_records: 用 schema.sql §97 一致的字段名（user_id / next_follow_time）
--   - lead_files: 同样切到 VARCHAR(64)
-- ============================================================

USE lan_dual_role_system;

DROP TABLE IF EXISTS lead_follow_records;
DROP TABLE IF EXISTS lead_files;

CREATE TABLE lead_follow_records (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL                            COMMENT '跟进人 users.id',
  follow_type VARCHAR(32) DEFAULT '微信'                  COMMENT '跟进方式: 电话/微信/面谈/其他',
  content TEXT NULL,
  next_follow_time DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_follow_lead_id (lead_id),
  INDEX idx_follow_user_id (user_id),
  INDEX idx_follow_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='客资跟进记录（销售跟进闭环）';

CREATE TABLE lead_files (
  id VARCHAR(64) PRIMARY KEY,
  lead_id VARCHAR(64) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type VARCHAR(32) NOT NULL DEFAULT 'image'           COMMENT 'image/screenshot/document',
  uploaded_by VARCHAR(64) NOT NULL                         COMMENT 'users.id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead_files_lead (lead_id),
  INDEX idx_lead_files_uploader (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='客资附件/截图';
