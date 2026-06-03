-- ============================================================
-- 主管建议表 (supervisor_suggestions)
-- 用于存储主管给运营的建议，支持关联账号、作品、员工
-- 功能：创建建议 -> 通知对应运营 -> 已读状态
-- ============================================================

USE lan_dual_role_system;

-- 创建主管建议表
CREATE TABLE IF NOT EXISTS supervisor_suggestions (
  id            VARCHAR(64)  PRIMARY KEY,
  sender_id     VARCHAR(64)  NOT NULL COMMENT '发送者（主管）用户ID',
  receiver_id   VARCHAR(64)  NOT NULL COMMENT '接收者（运营）用户ID',
  employee_id   VARCHAR(64)  NULL COMMENT '关联员工ID（方便查询该员工的所有建议）',
  target_type   VARCHAR(32)  NOT NULL COMMENT '建议对象类型：post/account/employee',
  target_id     VARCHAR(64)  NOT NULL COMMENT '建议对象ID',
  content       TEXT         NOT NULL COMMENT '建议内容',
  read_status   TINYINT      NOT NULL DEFAULT 0 COMMENT '已读状态：0未读 1已读',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ss_employee_id   (employee_id),
  INDEX idx_ss_target        (target_type, target_id),
  INDEX idx_ss_receiver      (receiver_id, read_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管建议表';
