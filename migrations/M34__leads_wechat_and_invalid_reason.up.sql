-- M34: 客资微信号 + 无效原因字段（对应 schema.sql 增量）
-- 涉及任务：T12 客资微信号 / T13 无效原因

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS wechat VARCHAR(128) NULL COMMENT '客资微信号（销售推老师微信后填写）',
  ADD COLUMN IF NOT EXISTS invalid_reason VARCHAR(255) NULL COMMENT '无效原因（标记无效客资时填写）';