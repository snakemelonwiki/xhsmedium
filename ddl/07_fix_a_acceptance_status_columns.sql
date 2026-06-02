-- ============================================================
-- A端验收修复：统一客资/协同状态列到当前 schema.sql 的正式英文状态码。
-- 适用场景：测试环境曾使用旧 DDL（中文 VARCHAR 或缺少 timeout 的 ENUM），
-- 导致 collaboration_tasks 写入 pending/handled 时 MySQL 报 Data truncated。
-- ============================================================

ALTER TABLE collaboration_tasks
  MODIFY COLUMN status ENUM('pending','handling','handled','closed','timeout')
  NOT NULL DEFAULT 'pending'
  COMMENT '协作状态: pending/handling/handled/closed/timeout';

ALTER TABLE leads
  MODIFY COLUMN status VARCHAR(32)
  NOT NULL DEFAULT 'new'
  COMMENT '客资状态: new/assigned/in_followup/in_collaboration/operation_handled/added_success/invalid',
  MODIFY COLUMN add_status VARCHAR(32)
  NOT NULL DEFAULT 'not_added'
  COMMENT '添加状态: not_added/applied/not_passed/operation_reminded/added';
