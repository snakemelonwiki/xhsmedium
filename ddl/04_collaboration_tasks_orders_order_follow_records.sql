-- ============================================================
-- DDL: collaboration_tasks, orders, order_follow_records
-- Database: lan_dual_role_system
-- Charset: utf8mb4 / Collate: utf8mb4_unicode_ci
-- ============================================================

CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  lead_id           BIGINT       NOT NULL COMMENT '关联线索 leads.id',
  requester_id      BIGINT       NOT NULL COMMENT '销售发起人 employees.id',
  handler_id        BIGINT       NULL     COMMENT '运营处理人 employees.id (未分配时为NULL)',
  type              VARCHAR(32)  NOT NULL COMMENT '协作类型: 提醒客户/补充信息/确认身份/二次触达等',
  reason            TEXT         NULL     COMMENT '发起协作的原因',
  status            VARCHAR(32)  NOT NULL DEFAULT '待处理' COMMENT '状态: 待处理/处理中/已处理/已关闭',
  handled_note      TEXT         NULL     COMMENT '处理人记录的处理内容',
  requested_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发起时间',
  handled_at        DATETIME     NULL     COMMENT '处理完成时间',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_collaboration_tasks_lead_id      (lead_id),
  INDEX idx_collaboration_tasks_requester_id (requester_id),
  INDEX idx_collaboration_tasks_handler_id   (handler_id),
  INDEX idx_collaboration_tasks_status       (status),
  INDEX idx_collaboration_tasks_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders ( 
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  lead_id           BIGINT       NOT NULL COMMENT '关联线索 leads.id',
  sales_id           BIGINT       NOT NULL COMMENT '销售 employees.id',
  academic_admin_id  BIGINT       NULL     COMMENT '教务 employees.id (未分配时为NULL)',
  service_type      VARCHAR(64)  NOT NULL COMMENT '服务类型: 培训/咨询/课程等',
  amount             DECIMAL(12,2) NULL     COMMENT '成交金额',
  paid_status        VARCHAR(32)  NOT NULL DEFAULT '未付款' COMMENT '付款状态: 未付款/部分付款/已付款',
  order_status       VARCHAR(32)  NOT NULL DEFAULT '待接收' COMMENT '订单状态: 待接收/进行中/待客户资料/待老师安排/待交付/已完成/异常',
  remark             TEXT         NULL     COMMENT '备注',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_orders_lead_id            (lead_id),
  INDEX idx_orders_sales_id           (sales_id),
  INDEX idx_orders_academic_admin_id  (academic_admin_id),
  INDEX idx_orders_order_status       (order_status),
  INDEX idx_orders_created_at         (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_follow_records (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  order_id          BIGINT       NOT NULL COMMENT '关联订单 orders.id',
  admin_id          BIGINT       NOT NULL COMMENT '教务 employees.id',
  node_type         VARCHAR(32)  NOT NULL COMMENT '节点类型: 资料收集/老师安排/节点完成/客户沟通等',
  content            TEXT         NULL     COMMENT '跟进内容',
  next_remind_at     DATETIME     NULL     COMMENT '下次提醒时间',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_order_follow_records_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;