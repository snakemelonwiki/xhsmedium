ALTER TABLE order_follow_records
  ADD COLUMN remind_stage VARCHAR(32) NULL COMMENT '提醒阶段' AFTER next_remind_at;
