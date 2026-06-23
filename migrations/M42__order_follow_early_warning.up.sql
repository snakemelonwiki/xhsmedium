-- ============================================================
-- M42: order_follow_records 提前预警字段
--
-- 业务来源：教务端节点提前7天预警需求
-- 变更内容：
--   1. order_follow_records 表新增 early_warning_sent_at 字段
--      （提前7天预警发送时间，独立于 reminder_sent_at 到期通知）
--   2. order_follow_records 表新增 enable_early_warning 字段
--      （是否启用提前7天预警，默认 false）
--
-- 用途说明：
--   - enable_early_warning = true 的记录会在 next_remind_at 前7天
--     收到 ORDER_NODE_EARLY_WARNING 通知
--   - enable_early_warning = false（默认）只走原有的到期提醒
--   - early_warning_sent_at 标记预警已发，保证幂等
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE order_follow_records
  ADD COLUMN early_warning_sent_at DATETIME NULL
  COMMENT '提前7天预警发送时间（独立于 reminder_sent_at）';

ALTER TABLE order_follow_records
  ADD COLUMN enable_early_warning TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '是否启用提前7天预警（0=仅到期提醒，1=提前7天+到期）';

SET FOREIGN_KEY_CHECKS = 1;
