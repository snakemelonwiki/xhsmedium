-- ============================================================
-- M46: order_finance 新增 expense（订单支出）字段
-- 业务需求：订单管理增加"订单支出"列，利润 = 合同金额 - 订单支出
-- ============================================================

SET NAMES utf8mb4;

ALTER TABLE order_finance
  ADD COLUMN IF NOT EXISTS expense DECIMAL(12,2) NULL COMMENT '订单支出';
