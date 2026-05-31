-- ============================================================
-- M9 回滚：恢复 M6 英文 ENUM 口径
--   仅建议在刚执行 M9 且确认没有写入新状态值时使用。
-- ============================================================

USE lan_dual_role_system;

UPDATE leads
SET status = CASE status
  WHEN 'in_collaboration' THEN 'in_collab'
  WHEN 'operation_handled' THEN 'in_followup'
  WHEN 'added_success' THEN 'contact_added'
  ELSE status
END;

UPDATE leads
SET add_status = CASE add_status
  WHEN 'not_passed' THEN 'rejected'
  WHEN 'operation_reminded' THEN 'op_reminded'
  ELSE add_status
END;

ALTER TABLE leads
  MODIFY COLUMN status ENUM('new','assigned','in_followup','in_collab','op_handling','contact_added','deal_closed','invalid')
    NOT NULL DEFAULT 'new' COMMENT '客资主状态(英文 code)',
  MODIFY COLUMN add_status ENUM('not_added','applied','pending','rejected','op_reminded','added')
    NOT NULL DEFAULT 'not_added' COMMENT '添加状态(英文 code)';
