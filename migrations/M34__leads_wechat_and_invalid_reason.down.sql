-- M34 down: 移除 leads.wechat 和 leads.invalid_reason

ALTER TABLE leads
  DROP COLUMN IF EXISTS wechat,
  DROP COLUMN IF EXISTS invalid_reason;