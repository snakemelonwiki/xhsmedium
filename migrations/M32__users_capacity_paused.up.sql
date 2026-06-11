-- M32: users 表增加客资容量上限状态字段
-- 背景：销售可手动标记"已达上限"，运营端派客资时红色警示。
-- 自动恢复：capacity_paused_at 超过1小时后惰性重置为 false。

ALTER TABLE users
  ADD COLUMN capacity_paused TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '是否已达客资上限：0可接客资 | 1已达上限（运营端红色警示）';

ALTER TABLE users
  ADD COLUMN capacity_paused_at DATETIME NULL
  COMMENT '点击"已达上限"的时间，超过1小时自动恢复';
