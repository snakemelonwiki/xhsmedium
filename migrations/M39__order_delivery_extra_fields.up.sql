ALTER TABLE orders
  ADD COLUMN fund_remark TEXT NULL COMMENT '基金信息备注' AFTER fund_info,
  ADD COLUMN backup_submission_url VARCHAR(500) NULL COMMENT '备用投稿信息表附件URL' AFTER author_registration_name,
  ADD COLUMN backup_submission_name VARCHAR(255) NULL COMMENT '备用投稿信息表附件原文件名' AFTER backup_submission_url;
