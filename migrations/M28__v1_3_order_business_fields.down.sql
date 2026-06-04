-- ============================================================
-- M28 down: 回滚 v1.3 订单业务字段增量
-- 警告：down 仅在开发/演练环境使用，线上回滚必须先备份并评估业务数据丢失
--
-- 回滚顺序与 up 相反：
--   1. 删除 payment_stage 字段
--   2. 删除 guarantee_type 字段 + 索引
--   3. 删除 product_type 字段 + 索引
--   4. 恢复 orders 表注释
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 回滚 payment_stage
ALTER TABLE orders DROP COLUMN IF EXISTS payment_stage;

-- 2. 回滚 guarantee_type
DROP INDEX idx_orders_guarantee_type ON orders;
ALTER TABLE orders DROP COLUMN IF EXISTS guarantee_type;

-- 3. 回滚 product_type
DROP INDEX idx_orders_product_type ON orders;
ALTER TABLE orders DROP COLUMN IF EXISTS product_type;

-- 4. 恢复 orders 表注释
ALTER TABLE orders COMMENT = '订单表（教务端字段扩展：客户基础/作者邮箱/老师派单/审核/阶段/查稿/风险）';

SET FOREIGN_KEY_CHECKS = 1;
