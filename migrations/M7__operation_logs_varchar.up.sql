-- ============================================================
-- M7: operation_logs 表从 BIGINT 自增主键迁移为 VARCHAR(64) UUID 主键
--   旧表（早期 ddl/05 BIGINT 风格）→ 新表 VARCHAR(64) 风格
--   原因：全局统一使用 VARCHAR(64) UUID 作为主键类型，
--         避免与其他表外键关联时的类型不一致。
--   前置：M1~M6 已应用
-- ⚠ 执行前必须停止 server.js 与 backend/ 服务（避免双写不一致）
-- ============================================================

USE lan_dual_role_system;

-- 删除旧表（数据已不再需要，操作日志属审计追踪，旧数据无保留价值）
DROP TABLE IF EXISTS operation_logs;

-- 重建为 VARCHAR(64) UUID 风格
CREATE TABLE IF NOT EXISTS operation_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL COMMENT '操作用户 users.id',
  action VARCHAR(64) NOT NULL COMMENT 'create/update/delete/login/export/assign',
  target_type VARCHAR(32) NOT NULL COMMENT 'lead/order/collaboration_task/post/account/employee',
  target_id VARCHAR(64) NOT NULL,
  detail TEXT NULL COMMENT '变更详情 JSON',
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_oplog_user (user_id),
  INDEX idx_oplog_target (target_type, target_id),
  INDEX idx_oplog_action (action),
  INDEX idx_oplog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志（审计追踪）';
