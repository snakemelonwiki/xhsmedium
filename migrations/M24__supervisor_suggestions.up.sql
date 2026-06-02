-- ============================================================
-- M24: supervisor_suggestions（主管建议表）
-- 来源：A 端 v1.2 P2-A 主管建议功能（doc/v1.2-完整交付版-AB端任务分配.md 行 281-288 / 518）
-- 作用：主管（admin/supervisor/owner）对运营员工下发建议
--   - 字段：supervisor_id 主管 users.id
--          operator_id 目标运营 users.id
--          post_id/account_id 可选关联
--          content 建议正文（≤ 1000 字）
--          is_read 0未读 1已读
-- 配套：
--   - notifications.type_code = 'supervisor_suggestion'（见 shared/notifications.ts）
--   - 后端 modules/supervisor-suggestions 提供 POST/GET 接口
-- ============================================================

USE lan_dual_role_system;

CREATE TABLE IF NOT EXISTS supervisor_suggestions (
  id            VARCHAR(64)  PRIMARY KEY,
  supervisor_id VARCHAR(64)  NOT NULL                    COMMENT '主管 users.id（admin/supervisor/owner）',
  operator_id   VARCHAR(64)  NOT NULL                    COMMENT '目标运营 users.id',
  post_id       VARCHAR(64)  NULL                        COMMENT '可选关联 posts.id',
  account_id    VARCHAR(64)  NULL                        COMMENT '可选关联 accounts.id',
  content       TEXT         NOT NULL                    COMMENT '建议正文（≤ 1000 字）',
  is_read       TINYINT(1)   NOT NULL DEFAULT 0          COMMENT '0未读 1已读',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sugg_operator   (operator_id, is_read, created_at),
  INDEX idx_sugg_supervisor (supervisor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='主管建议表（主管→运营）';
