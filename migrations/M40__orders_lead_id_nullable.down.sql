-- M40 rollback: 恢复 orders.lead_id 和 sales_user_id 为 NOT NULL（需确保无 NULL 数据）
UPDATE orders SET lead_id = '' WHERE lead_id IS NULL;
UPDATE orders SET sales_user_id = '' WHERE sales_user_id IS NULL;
ALTER TABLE orders MODIFY COLUMN lead_id VARCHAR(64) NOT NULL COMMENT '所属客资ID';
ALTER TABLE orders MODIFY COLUMN sales_user_id VARCHAR(64) NOT NULL COMMENT '销售用户ID';
