-- ============================================================
-- M26 down: 回滚 v1.3 数据层增量
-- 警告：down 仅在开发/演练环境使用，线上回滚必须先备份并评估业务数据丢失
--
-- 回滚顺序与 up 相反：
--   1. 删除序列表 orders_order_code_seq
--   2. 删除 orders.order_code 字段 + 唯一索引
--   3. 删除 leads 6 个销售跟进字段
--   4. 删除 leads.is_dispatched 字段 + 索引
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 删除序列表
-- ============================================================
DROP TABLE IF EXISTS orders_order_code_seq;

-- ============================================================
-- 2. 回滚 orders.order_code
-- ============================================================
DROP INDEX uk_orders_order_code        ON orders;
ALTER TABLE orders DROP COLUMN IF EXISTS order_code;

-- ============================================================
-- 3. 回滚 leads 销售跟进字段（CROSS-2）
-- ============================================================
DROP INDEX idx_leads_follow_action_at  ON leads;
ALTER TABLE leads DROP COLUMN IF EXISTS follow_action_at;
ALTER TABLE leads DROP COLUMN IF EXISTS follow_action;
ALTER TABLE leads DROP COLUMN IF EXISTS objection_point;
ALTER TABLE leads DROP COLUMN IF EXISTS client_time_requirement;
ALTER TABLE leads DROP COLUMN IF EXISTS client_major_research;
ALTER TABLE leads DROP COLUMN IF EXISTS client_degree;

-- ============================================================
-- 4. 回滚 leads.is_dispatched（CROSS-1）
-- ============================================================
DROP INDEX idx_leads_is_dispatched     ON leads;
ALTER TABLE leads DROP COLUMN IF EXISTS is_dispatched;

-- 恢复 leads 表注释
ALTER TABLE leads COMMENT = '客资线索表';

SET FOREIGN_KEY_CHECKS = 1;
