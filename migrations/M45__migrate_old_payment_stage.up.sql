-- ============================================================
-- M45: 旧订单付款阶段迁移到 payment_stage_detail JSON 字段
--
-- 业务背景：
--   - 旧订单的 payment_stage 字段存储自由文本（如"已付定金"、"已付中期"、"已付后期"等）
--   - 历史规则：旧订单统一使用 4 个付款阶段（定金 / 前期 / 中期 / 后期）
--   - 新系统使用 payment_plan（three/four）+ payment_stage_detail（JSON）管理分期
--   - 需要把旧订单的付款阶段信息和金额迁移到新的结构化字段
--
-- 迁移策略：
--   1. 所有 payment_stage_detail 为 NULL 的旧订单，payment_plan 统一设为 'four'
--   2. 四阶段固定顺序：定金（index 0）/ 前期（index 1）/ 中期（index 2）/ 后期（index 3）
--   3. currentStageIndex：根据旧 payment_stage 文本推导当前已付进度
--   4. 金额：旧数据没有 order_payments 分阶段记录，从 order_finance.client_paid 取累计已付金额，
--      放入当前阶段；前面阶段金额填 "0.00"
--   5. payment_stage：迁移后更新为当前阶段的 label（"定金"/"前期"/"中期"/"后期"）
--   6. label 统一不带"已付"前缀，与新订单 buildPaymentStageDetail() 生成格式保持一致
--   7. 幂等：可重复执行，已有 payment_stage_detail 的订单会被跳过
--
-- 依赖：MySQL 8.0+（JSON_OBJECT / JSON_ARRAY / JSON_SET 函数）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 步骤 0：创建辅助临时表，用于记录迁移前后的订单 ID 和状态
-- ============================================================
CREATE TABLE IF NOT EXISTS _m45_migration_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  old_payment_stage VARCHAR(64),
  old_payment_plan VARCHAR(16),
  new_payment_plan VARCHAR(16),
  new_current_stage_index INT,
  new_payment_stage VARCHAR(32),
  migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_id (order_id)
);

-- ============================================================
-- 步骤 1：旧订单统一设为 4 阶段方案
--   只处理 payment_stage_detail 为 NULL 的旧订单
-- ============================================================
UPDATE orders
SET payment_plan = 'four'
WHERE payment_stage_detail IS NULL
  AND payment_stage IS NOT NULL;

-- ============================================================
-- 步骤 2：构建 four 方案的 payment_stage_detail JSON
--   阶段顺序固定：定金 / 前期 / 中期 / 后期
-- ============================================================

-- 2.1 未付/未付款（currentStageIndex: -1）
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', -1
)
WHERE payment_stage_detail IS NULL
  AND payment_plan = 'four'
  AND payment_stage IS NOT NULL
  AND (payment_stage LIKE '%未付%' OR payment_stage LIKE '%未付款%');

-- 2.2 已付定金/定金（不含前期/中期/后期/全款，currentStageIndex: 0）
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', 0
)
WHERE payment_stage_detail IS NULL
  AND payment_plan = 'four'
  AND payment_stage IS NOT NULL
  AND (payment_stage LIKE '%定金%' OR payment_stage LIKE '%已付定金%')
  AND NOT (payment_stage LIKE '%前期%' OR payment_stage LIKE '%中期%' OR payment_stage LIKE '%后期%' OR payment_stage LIKE '%全款%');

-- 2.3 已付前期/前期（不含中期/后期/全款，currentStageIndex: 1）
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', 1
)
WHERE payment_stage_detail IS NULL
  AND payment_plan = 'four'
  AND payment_stage IS NOT NULL
  AND (payment_stage LIKE '%前期%' OR payment_stage LIKE '%已付前期%')
  AND NOT (payment_stage LIKE '%中期%' OR payment_stage LIKE '%后期%' OR payment_stage LIKE '%全款%');

-- 2.4 已付中期/中期（不含后期/全款，currentStageIndex: 2）
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', 2
)
WHERE payment_stage_detail IS NULL
  AND payment_plan = 'four'
  AND payment_stage IS NOT NULL
  AND (payment_stage LIKE '%中期%' OR payment_stage LIKE '%已付中期%')
  AND NOT (payment_stage LIKE '%后期%' OR payment_stage LIKE '%全款%');

-- 2.5 已付后期/后期/全款（currentStageIndex: 3）
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', 3
)
WHERE payment_stage_detail IS NULL
  AND payment_plan = 'four'
  AND payment_stage IS NOT NULL
  AND (payment_stage LIKE '%后期%' OR payment_stage LIKE '%全款%');

-- ============================================================
-- 步骤 3：从 order_payments 表补充各阶段金额和付款时间（如存在）
--   - deposit  → stages[0]
--   - midterm  → stages[1]
--   - final    → stages[2]
--   - extra    → stages[3]
-- ============================================================

-- 3.1 补充 deposit（定金）阶段 → stages[0]
UPDATE orders o
JOIN order_payments op ON o.id = op.order_id AND op.stage_code = 'deposit'
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[0].amount', IF(op.amount IS NOT NULL, CAST(op.amount AS CHAR), '0.00'),
  '$.stages[0].paidAt', IF(op.paid_at IS NOT NULL, op.paid_at, CAST(NULL AS JSON))
)
WHERE o.payment_stage_detail IS NOT NULL
  AND op.amount IS NOT NULL;

-- 3.2 补充 midterm（中期）阶段 → stages[1]
UPDATE orders o
JOIN order_payments op ON o.id = op.order_id AND op.stage_code = 'midterm'
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[1].amount', IF(op.amount IS NOT NULL, CAST(op.amount AS CHAR), '0.00'),
  '$.stages[1].paidAt', IF(op.paid_at IS NOT NULL, op.paid_at, CAST(NULL AS JSON))
)
WHERE o.payment_stage_detail IS NOT NULL
  AND op.amount IS NOT NULL;

-- 3.3 补充 final 阶段 → stages[2]
UPDATE orders o
JOIN order_payments op ON o.id = op.order_id AND op.stage_code = 'final'
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[2].amount', IF(op.amount IS NOT NULL, CAST(op.amount AS CHAR), '0.00'),
  '$.stages[2].paidAt', IF(op.paid_at IS NOT NULL, op.paid_at, CAST(NULL AS JSON))
)
WHERE o.payment_stage_detail IS NOT NULL
  AND op.amount IS NOT NULL;

-- 3.4 补充 extra 阶段 → stages[3]
UPDATE orders o
JOIN order_payments op ON o.id = op.order_id AND op.stage_code = 'extra'
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[3].amount', IF(op.amount IS NOT NULL, CAST(op.amount AS CHAR), '0.00'),
  '$.stages[3].paidAt', IF(op.paid_at IS NOT NULL, op.paid_at, CAST(NULL AS JSON))
)
WHERE o.payment_stage_detail IS NOT NULL
  AND op.amount IS NOT NULL;

-- ============================================================
-- 步骤 4：从 order_finance.client_paid 补充当前阶段金额（兜底）
--   旧数据没有 order_payments 分阶段记录，只能把累计已付金额
--   放入 currentStageIndex 对应的阶段。前面阶段金额保持 "0.00"。
-- ============================================================

-- 4.1 currentStageIndex = 0（定金）
UPDATE orders o
JOIN order_finance f ON o.id = f.order_id
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[0].amount', CAST(f.client_paid AS CHAR)
)
WHERE o.payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(o.payment_stage_detail, '$.currentStageIndex') = 0
  AND JSON_UNQUOTE(JSON_EXTRACT(o.payment_stage_detail, '$.stages[0].amount')) = '0.00'
  AND f.client_paid IS NOT NULL
  AND f.client_paid > 0;

-- 4.2 currentStageIndex = 1（前期）
UPDATE orders o
JOIN order_finance f ON o.id = f.order_id
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[1].amount', CAST(f.client_paid AS CHAR)
)
WHERE o.payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(o.payment_stage_detail, '$.currentStageIndex') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(o.payment_stage_detail, '$.stages[1].amount')) = '0.00'
  AND f.client_paid IS NOT NULL
  AND f.client_paid > 0;

-- 4.3 currentStageIndex = 2（中期）
UPDATE orders o
JOIN order_finance f ON o.id = f.order_id
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[2].amount', CAST(f.client_paid AS CHAR)
)
WHERE o.payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(o.payment_stage_detail, '$.currentStageIndex') = 2
  AND JSON_UNQUOTE(JSON_EXTRACT(o.payment_stage_detail, '$.stages[2].amount')) = '0.00'
  AND f.client_paid IS NOT NULL
  AND f.client_paid > 0;

-- 4.4 currentStageIndex = 3（后期）
UPDATE orders o
JOIN order_finance f ON o.id = f.order_id
SET o.payment_stage_detail = JSON_SET(
  o.payment_stage_detail,
  '$.stages[3].amount', CAST(f.client_paid AS CHAR)
)
WHERE o.payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(o.payment_stage_detail, '$.currentStageIndex') = 3
  AND JSON_UNQUOTE(JSON_EXTRACT(o.payment_stage_detail, '$.stages[3].amount')) = '0.00'
  AND f.client_paid IS NOT NULL
  AND f.client_paid > 0;

-- ============================================================
-- 步骤 5：更新 payment_stage 为当前阶段的 label（不带"已付"前缀）
-- ============================================================

-- 5.1 currentStageIndex = 0 → 定金
UPDATE orders
SET payment_stage = '定金'
WHERE payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(payment_stage_detail, '$.currentStageIndex') = 0;

-- 5.2 currentStageIndex = 1 → 前期
UPDATE orders
SET payment_stage = '前期'
WHERE payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(payment_stage_detail, '$.currentStageIndex') = 1;

-- 5.3 currentStageIndex = 2 → 中期
UPDATE orders
SET payment_stage = '中期'
WHERE payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(payment_stage_detail, '$.currentStageIndex') = 2;

-- 5.4 currentStageIndex = 3 → 后期
UPDATE orders
SET payment_stage = '后期'
WHERE payment_stage_detail IS NOT NULL
  AND JSON_EXTRACT(payment_stage_detail, '$.currentStageIndex') = 3;

-- 5.5 currentStageIndex = -1（未付）→ 保持原值不变

-- ============================================================
-- 步骤 6：兜底 - 还有 payment_stage_detail 为 NULL 的订单
--   统一按 four 方案 + 定金阶段处理
-- ============================================================
UPDATE orders
SET payment_stage_detail = JSON_OBJECT(
  'plan', 'four',
  'stages', JSON_ARRAY(
    JSON_OBJECT('name', '定金', 'label', '定金', 'amount', COALESCE(CAST(amount AS CHAR), '0.00'), 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '前期', 'label', '前期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '中期', 'label', '中期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON)),
    JSON_OBJECT('name', '后期', 'label', '后期', 'amount', '0.00', 'paidAt', CAST(NULL AS JSON))
  ),
  'currentStageIndex', 0
)
WHERE payment_stage_detail IS NULL
  AND payment_stage IS NOT NULL;

-- ============================================================
-- 步骤 7：记录迁移日志
-- ============================================================
INSERT INTO _m45_migration_log (order_id, old_payment_stage, old_payment_plan, new_payment_plan, new_current_stage_index, new_payment_stage)
SELECT
  o.id,
  o.payment_stage,
  o.payment_plan,
  JSON_UNQUOTE(JSON_EXTRACT(o.payment_stage_detail, '$.plan')),
  JSON_EXTRACT(o.payment_stage_detail, '$.currentStageIndex'),
  o.payment_stage
FROM orders o
WHERE o.payment_stage_detail IS NOT NULL
  AND o.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY o.updated_at DESC;

-- ============================================================
-- 步骤 8：清理临时表（可选，注释掉以保留日志）
-- ============================================================
-- DROP TABLE IF EXISTS _m45_migration_log;

-- ============================================================
-- 步骤 9：同步表注释
-- ============================================================
ALTER TABLE orders COMMENT = '订单表（v1.3 增量：M26 订单编号 + M28 产品/保障/付款阶段 业务字段 + M41 分期方案 + M45 旧订单四阶段付款迁移到 JSON）';

SET FOREIGN_KEY_CHECKS = 1;
