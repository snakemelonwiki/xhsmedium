USE lan_dual_role_system;

-- 回退：订单状态字段改回 ENUM（不推荐，会丢失 pending_accept/closed/refunded 数据）

ALTER TABLE orders
  MODIFY COLUMN order_status ENUM('to_receive','in_progress','awaiting_client_info','awaiting_teacher','to_deliver','completed','abnormal') NOT NULL DEFAULT 'to_receive'
         COMMENT '订单状态',
  MODIFY COLUMN paid_status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid'
         COMMENT '付款状态';
