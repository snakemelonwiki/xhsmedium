-- ============================================================
-- Table: notifications
-- Purpose: System notifications across all four ports
--          (operations, sales, academic, supervisor)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  receiver_id       BIGINT       NOT NULL COMMENT 'FK -> users.id, who receives the notification',
  sender_id         BIGINT       NULL     COMMENT 'FK -> users.id, who sent it; NULL for system-generated',
  port_type         VARCHAR(32)  NOT NULL COMMENT 'operations|sales|academic|supervisor',
  notification_type VARCHAR(32)  NOT NULL COMMENT 'lead_assigned|collaboration_requested|customer_not_passed|collaboration_handled|lead_added_success|order_created|order_updated|supervisor_remind|academic_remind etc',
  title             VARCHAR(255) NOT NULL COMMENT 'Notification title',
  content           TEXT         NULL     COMMENT 'Notification body',
  related_id        BIGINT       NULL     COMMENT 'Polymorphic reference: lead_id, order_id, collaboration_task_id etc',
  related_type      VARCHAR(32)  NULL     COMMENT 'Clarifies what related_id points to: lead|order|collaboration_task|post|account',
  read_status       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0=unread, 1=read',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notifications_receiver_id (receiver_id),
  INDEX idx_notifications_read_status (read_status),
  INDEX idx_notifications_created_at (created_at),
  INDEX idx_notifications_notification_type (notification_type),
  INDEX idx_notifications_receiver_read_created (receiver_id, read_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: operation_logs
-- Purpose: Immutable audit trail of user actions across
--          all system operations
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_logs (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  user_id    BIGINT       NOT NULL COMMENT 'FK -> users.id, who performed the action',
  action     VARCHAR(64)  NOT NULL COMMENT 'create|update|delete|login|export|assign etc',
  target_type VARCHAR(32) NOT NULL COMMENT 'post|lead|account|employee|order|collaboration_task etc',
  target_id  BIGINT       NOT NULL COMMENT 'ID of the target object',
  detail     TEXT         NULL     COMMENT 'JSON or text description of what changed',
  ip         VARCHAR(45)  NULL     COMMENT 'Client IP, supports IPv4 and IPv6',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_operation_logs_user_id (user_id),
  INDEX idx_operation_logs_target_type (target_type),
  INDEX idx_operation_logs_target_id (target_id),
  INDEX idx_operation_logs_action (action),
  INDEX idx_operation_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: exports
-- Purpose: Track async export tasks (posts, leads, rankings,
--          orders, collaboration_records)
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  user_id      BIGINT       NOT NULL COMMENT 'FK -> users.id, who requested the export',
  export_type  VARCHAR(32)  NOT NULL COMMENT 'posts|leads|rankings|orders|collaboration_records',
  filter_json  TEXT         NULL     COMMENT 'JSON string of filter conditions applied',
  file_url     VARCHAR(500) NULL     COMMENT 'Path/URL to the generated file',
  status       VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT 'pending|processing|completed|failed',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME     NULL     COMMENT 'Set when export completes or fails',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_exports_user_id (user_id),
  INDEX idx_exports_status (status),
  INDEX idx_exports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;