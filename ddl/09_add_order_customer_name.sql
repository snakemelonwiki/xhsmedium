ALTER TABLE orders
  ADD COLUMN customer_name VARCHAR(128) NULL COMMENT '客户姓名（教务端交付资料维护）' AFTER payment_stage;
