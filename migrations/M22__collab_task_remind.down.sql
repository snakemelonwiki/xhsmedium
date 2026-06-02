-- M22__collab_task_remind.down.sql
-- 回滚 M22__collab_task_remind.up.sql

USE lan_dual_role_system;

ALTER TABLE collaboration_tasks DROP INDEX idx_collab_last_remind;

ALTER TABLE collaboration_tasks
  DROP COLUMN last_remind_at,
  DROP COLUMN remind_count;
