-- ============================================================
-- M18 回滚：移除 leads.deal_status 字段
-- 警告：字段已无数据 / 数据可丢弃时再执行；否则先备份 leads 表
-- ============================================================

USE lan_dual_role_system;

ALTER TABLE leads DROP COLUMN deal_status;
