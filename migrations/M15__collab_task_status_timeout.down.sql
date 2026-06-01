-- ============================================================
-- M15 协同任务 status 枚举扩展（回滚）：移除 'timeout'
-- 注意：回滚前必须确保没有 status='timeout' 的行，否则 MODIFY 会失败；
--       先 UPDATE collaboration_tasks SET status='closed' WHERE status='timeout';
-- ============================================================

USE lan_dual_role_system;

-- 先把所有 timeout 行回退成 closed（业务上认为超时 = 关单）
UPDATE collaboration_tasks SET status = 'closed' WHERE status = 'timeout';

ALTER TABLE collaboration_tasks
  MODIFY COLUMN status
    ENUM('pending','handling','handled','closed')
    NOT NULL DEFAULT 'pending'
    COMMENT '协作状态';
