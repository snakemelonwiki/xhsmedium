-- ============================================================
-- M9: 放宽 leads 状态列为 VARCHAR
--   M6 曾将 status/add_status 改为 ENUM，后续 B 端状态机新增
--   in_collaboration / operation_handled / added_success 等 code 时，
--   旧库会因 ENUM 不包含新值而报 Data truncated。
--
--   schema.sql 当前已采用 VARCHAR 口径，本迁移用于把已执行过 M6 的库
--   迁回与 schema.sql 一致的结构。
-- ============================================================

USE lan_dual_role_system;

ALTER TABLE leads
  MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'new' COMMENT '客资状态',
  MODIFY COLUMN add_status VARCHAR(32) NOT NULL DEFAULT 'not_added' COMMENT '添加状态',
  MODIFY COLUMN process_status VARCHAR(32) NOT NULL DEFAULT 'not_contacted' COMMENT '销售处理状态';

UPDATE leads
SET status = CASE status
  WHEN 'in_collab' THEN 'in_collaboration'
  WHEN 'op_handling' THEN 'in_collaboration'
  WHEN 'contact_added' THEN 'added_success'
  ELSE status
END;

UPDATE leads
SET add_status = CASE add_status
  WHEN 'pending' THEN 'applied'
  WHEN 'rejected' THEN 'not_passed'
  WHEN 'op_reminded' THEN 'operation_reminded'
  ELSE add_status
END;
