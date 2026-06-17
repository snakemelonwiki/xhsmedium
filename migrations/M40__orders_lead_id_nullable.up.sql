-- M40: 教务直建订单不再强制要求关联客资和销售
ALTER TABLE orders MODIFY COLUMN lead_id VARCHAR(64) NULL COMMENT '关联客资ID（教务直建订单可为空）';
ALTER TABLE orders MODIFY COLUMN sales_user_id VARCHAR(64) NULL COMMENT '销售用户ID（教务直建订单可为空）';
