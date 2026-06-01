-- ============================================================
-- M15 协同任务 status 枚举扩展：增加 'timeout'
-- 配合后台协作任务超时扫描器（collabTimeoutScan）使用
-- 对应服务：
--   backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts
--   backend/src/modules/collaboration-tasks/collaboration-tasks.controller.ts
--   backend/src/modules/collaboration-tasks/collaboration-tasks.module.ts
--   backend/src/entities/collaboration-task.entity.ts
--   backend/src/shared/notifications.ts  (NOTIFICATION_TYPES.COLLABORATION_TIMEOUT)
-- ============================================================

USE lan_dual_role_system;

-- 原定义：
--   status ENUM('pending','handling','handled','closed') NOT NULL DEFAULT 'pending'
-- 新定义（仅追加 'timeout'，不破坏已有数据）：
--   status ENUM('pending','handling','handled','closed','timeout') NOT NULL DEFAULT 'pending'
ALTER TABLE collaboration_tasks
  MODIFY COLUMN status
    ENUM('pending','handling','handled','closed','timeout')
    NOT NULL DEFAULT 'pending'
    COMMENT '协作状态（含超时态 timeout）';
