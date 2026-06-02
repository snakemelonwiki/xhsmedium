USE lan_dual_role_system;

-- M19: orders.order_status / orders.paid_status 改 VARCHAR(32) + 补状态
-- 文档 1.2 §5.2/§10.3 要求所有状态字段统一 VARCHAR(32)
-- 实际 schema.sql 280-281 行仍是 ENUM，与文档不一致
-- 同步补 pending_accept/closed (order_status) 和 refunded (paid_status)
-- MODIFY COLUMN 自动从 ENUM 转为 VARCHAR(32)，保留现有数据

ALTER TABLE orders
  MODIFY COLUMN order_status VARCHAR(32) NOT NULL DEFAULT 'to_receive'
         COMMENT '订单状态：pending_accept/to_receive/in_progress/awaiting_client_info/awaiting_teacher/to_deliver/completed/abnormal/closed',
  MODIFY COLUMN paid_status VARCHAR(32) NOT NULL DEFAULT 'unpaid'
         COMMENT '付款状态：unpaid/partial/paid/refunded';
