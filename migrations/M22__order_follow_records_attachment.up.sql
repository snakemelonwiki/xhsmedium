ALTER TABLE order_follow_records
  ADD COLUMN attachment_url VARCHAR(512) NULL COMMENT '附件 URL',
  ADD COLUMN attachment_name VARCHAR(255) NULL COMMENT '附件原始文件名';
