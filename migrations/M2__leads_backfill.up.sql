-- ============================================================
-- M2: leads 历史数据回填
--   2.1 intention_level ← intention 中文值映射
--   2.2 process_status  ← process_status_legacy 中文值映射
--   2.3 add_method      ← 旧数据保持 unknown，由运营在 §四后台手动认领
--   2.4 lead_code       ← 由 scripts/backfill-lead-code.js 生成（不在本 SQL 中）
-- 前置：M1 已应用
-- ============================================================

USE lan_dual_role_system;

-- 2.1 intention → intention_level
UPDATE leads SET intention_level = 'high'    WHERE intention = '强意向';
UPDATE leads SET intention_level = 'mid'     WHERE intention IN ('了解备用','中意向');
UPDATE leads SET intention_level = 'low'     WHERE intention IN ('弱','低意向');
UPDATE leads SET intention_level = 'invalid' WHERE intention = '无效';
UPDATE leads
   SET intention_level = 'pending'
 WHERE intention IS NULL
    OR intention NOT IN ('强意向','了解备用','中意向','弱','低意向','无效');

-- 2.2 process_status_legacy → process_status
UPDATE leads SET process_status = 'not_contacted'
 WHERE process_status_legacy IN ('未接','未联系') OR process_status_legacy IS NULL;
UPDATE leads SET process_status = 'applied'  WHERE process_status_legacy IN ('已接','已发送申请');
UPDATE leads SET process_status = 'pending'  WHERE process_status_legacy = '待通过';
UPDATE leads SET process_status = 'passed'   WHERE process_status_legacy = '已通过';
UPDATE leads SET process_status = 'chatting' WHERE process_status_legacy = '沟通中';
UPDATE leads SET process_status = 'quoted'   WHERE process_status_legacy = '已报价';
UPDATE leads SET process_status = 'closed'   WHERE process_status_legacy = '已成交';
UPDATE leads SET process_status = 'invalid'  WHERE process_status_legacy = '无效';

-- 验证：未命中任何映射的 legacy 值（应为空集，否则人工核对）
-- SELECT process_status_legacy, COUNT(*) FROM leads
--  WHERE process_status_legacy IS NOT NULL
--    AND process_status_legacy NOT IN ('未接','未联系','已接','已发送申请','待通过','已通过','沟通中','已报价','已成交','无效')
--  GROUP BY process_status_legacy;
