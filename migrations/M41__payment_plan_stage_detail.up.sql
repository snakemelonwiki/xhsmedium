-- ============================================================
-- M41: v1.3 付款阶段×付款状态联动重构
--
-- 业务来源：doc/20260622/20260622-todo.md 销售端 bug #6
-- 变更内容：
--   1. orders 表新增 payment_plan 字段（分期方案：three/four）
--   2. orders 表新增 payment_stage_detail 字段（分期明细 JSON）
--   3. 同步 orders 表注释
--
-- 字段类型说明：
--   - payment_plan 用 VARCHAR(16) 支持 'three' / 'four'
--   - payment_stage_detail 用 TEXT 存储分期 JSON 明细
--   - 两个字段全部可空，兼容旧数据；新订单必填由应用层校验
--
-- 幂等：所有 ALTER 使用 IF NOT EXISTS / DROP COLUMN IF EXISTS 兼容 MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 分期方案
--   取值：three（分三笔：定金/中期/尾款）/ four（分四笔：定金/前期/中期/后期）
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_plan VARCHAR(16) NULL
  COMMENT '分期方案：three（分三笔）/ four（分四笔）';

-- ============================================================
-- 2. 分期明细（JSON）
--   格式：{ plan, stages: [{name,label,amount,paidAt}], currentStageIndex }
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_stage_detail TEXT NULL
  COMMENT '分期明细 JSON：{plan,stages:[{name,label,amount,paidAt}],currentStageIndex}';

-- 同步 orders 表注释
ALTER TABLE orders COMMENT = '订单表（v1.3 增量：付款阶段×付款状态联动重构 — M41 payment_plan + payment_stage_detail）';

SET FOREIGN_KEY_CHECKS = 1;
