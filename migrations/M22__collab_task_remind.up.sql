-- ============================================================
-- M22: 协同任务"再次提醒"字段
-- 来源：B 端 v1.2 P2-B 协同再次提醒功能（doc/v1.2-完整交付版-AB端任务分配.md 行 351/363）
-- 变更：
--   1. collaboration_tasks 新增 remind_count / last_remind_at
--   2. 复合索引 (status, last_remind_at) 方便按"近期已提醒 + 当前状态"排查
-- ============================================================

USE lan_dual_role_system;

-- 1. 字段新增（与 entity 同步，缺省值 0 保证历史数据不破坏）
ALTER TABLE collaboration_tasks
  ADD COLUMN remind_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_remind_at DATETIME NULL;

-- 2. 索引：常按"status + 最近提醒时间"做排查/统计
ALTER TABLE collaboration_tasks
  ADD INDEX idx_collab_last_remind (status, last_remind_at);
