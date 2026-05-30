-- ============================================================
-- M1 回滚：撤销 leads 表的字段扩展
-- ⚠ 仅在 M1 应用后立即回滚有效；若已运行业务并产生新数据，回滚会丢失业务字段。
-- ============================================================

USE lan_dual_role_system;

-- 删索引（如果先做了 M2_post_backfill 加 UNIQUE，先单独删）
ALTER TABLE leads DROP INDEX IF EXISTS uk_leads_lead_code;

ALTER TABLE leads
  DROP INDEX idx_leads_intention_level,
  DROP INDEX idx_leads_add_method,
  DROP INDEX idx_leads_matched_post_id,
  DROP INDEX idx_leads_next_follow;

-- 还原 process_status：删新列、把 legacy 列改回 process_status
ALTER TABLE leads DROP COLUMN process_status;
ALTER TABLE leads
  CHANGE COLUMN process_status_legacy process_status VARCHAR(32) NOT NULL DEFAULT '未接';

-- 删除新增的 6 列
ALTER TABLE leads
  DROP COLUMN lead_code,
  DROP COLUMN intention_level,
  DROP COLUMN add_method,
  DROP COLUMN next_follow_time,
  DROP COLUMN matched_post_id,
  DROP COLUMN source_unknown;
