-- ============================================================
-- 表：notifications（通知表）
-- 用途：面向运营、销售、教学、督导四个端口的系统通知
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '通知主键ID',
  receiver_id       BIGINT       NOT NULL COMMENT '接收者ID，外键关联 users.id',
  sender_id         BIGINT       NULL     COMMENT '发送者ID，外键关联 users.id；系统通知为NULL',
  port_type         VARCHAR(32)  NOT NULL COMMENT '所属端口：operations运营|sales销售|academic教学|supervisor督导',
  notification_type VARCHAR(32)  NOT NULL COMMENT '通知类型：lead_assigned客资分配|collaboration_requested协作请求|customer_not_passed未通过客户|collaboration_handled协作处理|lead_added_success客资添加成功|order_created订单创建|order_updated订单更新|supervisor_remind督导提醒|academic_remind教学提醒等',
  title             VARCHAR(255) NOT NULL COMMENT '通知标题',
  content           TEXT         NULL     COMMENT '通知内容',
  related_id        BIGINT       NULL     COMMENT '关联业务ID：客资、订单、协作任务、帖子、账号等',
  related_type      VARCHAR(32)  NULL     COMMENT '关联类型：lead客资|order订单|collaboration_task协作任务|post帖子|account账号',
  read_status       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '阅读状态：0未读、1已读',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX idx_notifications_receiver_id (receiver_id) COMMENT '按接收者ID索引',
  INDEX idx_notifications_read_status (read_status) COMMENT '按阅读状态索引',
  INDEX idx_notifications_created_at (created_at) COMMENT '按创建时间索引',
  INDEX idx_notifications_notification_type (notification_type) COMMENT '按通知类型索引',
  INDEX idx_notifications_receiver_read_created (receiver_id, read_status, created_at) COMMENT '按接收者、阅读状态和创建时间的组合索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表：面向四个端口的通知消息存储';

-- ============================================================
-- 表：operation_logs（操作日志表）
-- 用途：记录所有端口系统操作的不可变审计日志
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_logs (
  id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '日志主键ID',
  user_id    BIGINT       NOT NULL COMMENT '操作用户ID，外键关联 users.id',
  action     VARCHAR(64)  NOT NULL COMMENT '操作动作：create创建|update更新|delete删除|login登录|export导出|assign分配等',
  target_type VARCHAR(32) NOT NULL COMMENT '操作对象类型：post帖子|lead客资|account账号|employee员工|order订单|collaboration_task协作任务等',
  target_id  BIGINT       NOT NULL COMMENT '操作对象ID',
  detail     TEXT         NULL     COMMENT '变更详情，JSON或文本描述',
  ip         VARCHAR(45)  NULL     COMMENT '客户端IP地址，支持IPv4和IPv6',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (id),
  INDEX idx_operation_logs_user_id (user_id) COMMENT '按操作用户ID索引',
  INDEX idx_operation_logs_target_type (target_type) COMMENT '按操作对象类型索引',
  INDEX idx_operation_logs_target_id (target_id) COMMENT '按操作对象ID索引',
  INDEX idx_operation_logs_action (action) COMMENT '按操作动作索引',
  INDEX idx_operation_logs_created_at (created_at) COMMENT '按操作时间索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表：用于审计追踪的关键操作记录';

-- ============================================================
-- 表：exports（数据导出任务表）
-- 用途：追踪异步导出任务状态（帖子、客资、排行、订单、协作记录等）
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '导出任务主键ID',
  user_id      BIGINT       NOT NULL COMMENT '发起导出请求的用户ID，外键关联 users.id',
  export_type  VARCHAR(32)  NOT NULL COMMENT '导出类型：posts帖子|leads客资|rankings排行|orders订单|collaboration_records协作记录等',
  filter_json  TEXT         NULL     COMMENT '应用的筛选条件，JSON格式',
  file_url     VARCHAR(500) NULL     COMMENT '生成文件的路径或下载地址',
  status       VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '任务状态：pending待处理|processing处理中|completed已完成|failed失败',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  finished_at  DATETIME     NULL     COMMENT '完成时间：任务完成或失败时设置',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  INDEX idx_exports_user_id (user_id) COMMENT '按请求用户ID索引',
  INDEX idx_exports_status (status) COMMENT '按任务状态索引',
  INDEX idx_exports_created_at (created_at) COMMENT '按创建时间索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据导出任务表：记录批量导出任务及执行状态';