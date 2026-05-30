-- ============================================================
-- M2 回滚：把 intention_level 与 process_status 还原为安全默认值
-- ⚠ 这只是数据回退，不删除新列；列删除请走 M1.down。
-- ============================================================

USE lan_dual_role_system;

UPDATE leads SET intention_level = 'pending';
UPDATE leads SET process_status  = 'not_contacted';

-- lead_code 的回退（脚本回填的）
UPDATE leads SET lead_code = NULL;
ALTER TABLE leads DROP INDEX IF EXISTS uk_leads_lead_code;
