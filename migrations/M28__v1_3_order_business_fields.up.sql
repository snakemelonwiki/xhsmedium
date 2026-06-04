-- ============================================================
-- M28: v1.3 订单业务字段增量（SA-8 / AC-1）
--
-- 业务来源：doc/v1.3-四端口迭代任务清单.md
--   - SA-8 销售端「我的成交」成交信息录入：
--     产品类型（专利/期刊论文/硕士毕业论文/博士毕业论文/基金/EI会议/普刊/国际会议）、
--     服务类型（已有 service_type）、
--     保障类型（保录/保盲审/不保）、
--     付款阶段（自由文本，如 定金/中期/尾款）
--   - AC-1 教务端「我的成交」菜单需展示以上字段
--
-- 变更内容：
--   1. orders 表新增 product_type 字段 + 索引
--   2. orders 表新增 guarantee_type 字段 + 索引
--   3. orders 表新增 payment_stage 字段
--   4. 同步 orders 表注释
--
-- 字段类型说明：
--   - product_type / guarantee_type 用 VARCHAR，与 v1.2 M19「状态字段统一为 VARCHAR」
--     的风格保持一致，避免 ENUM 修改卡死的问题
--   - payment_stage 用 VARCHAR(64) 支持自由文本（定金/中期/尾款 等）
--   - 三个字段全部可空，兼容 v1.2 历史数据；新订单必填由应用层校验
--
-- 幂等：所有 ALTER 使用 IF NOT EXISTS / DROP COLUMN IF EXISTS 兼容 MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 产品类型
--   取值：专利 / 期刊论文 / 硕士毕业论文 / 博士毕业论文 /
--         基金 / EI会议 / 普刊 / 国际会议
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_type VARCHAR(32) NULL
  COMMENT '产品类型：专利/期刊论文/硕士毕业论文/博士毕业论文/基金/EI会议/普刊/国际会议';

CREATE INDEX IF NOT EXISTS idx_orders_product_type ON orders (product_type);

-- ============================================================
-- 2. 保障类型
--   取值：保录 / 保盲审 / 不保
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guarantee_type VARCHAR(16) NULL
  COMMENT '保障类型：保录/保盲审/不保';

CREATE INDEX IF NOT EXISTS idx_orders_guarantee_type ON orders (guarantee_type);

-- ============================================================
-- 3. 付款阶段（自由文本）
--   示例：定金 / 中期 / 尾款 / 全款 / 其它业务自定义
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_stage VARCHAR(64) NULL
  COMMENT '付款阶段：定金/中期/尾款 等自由文本';

-- 同步 orders 表注释
ALTER TABLE orders COMMENT = '订单表（v1.3 增量：M26 订单编号 + M28 产品/保障/付款阶段 业务字段；教务端字段扩展：客户基础/作者邮箱/老师派单/审核/阶段/查稿/风险）';

SET FOREIGN_KEY_CHECKS = 1;
