-- ============================================================
-- M6 回滚：恢复 add_status / status 为旧 VARCHAR 中文列
-- ⚠ 仅在 M6 应用后立即回滚有效；新业务可能已写入英文 code，回滚需先反映射。
-- ============================================================

USE lan_dual_role_system;

-- ============================================================
-- add_status 回滚
-- ============================================================

-- 反映射：英文 ENUM → 中文，写回 legacy 列
UPDATE leads SET add_status_legacy =
  CASE add_status
    WHEN 'not_added' THEN '未添加'
    WHEN 'applied' THEN '已申请添加'
    WHEN 'pending' THEN '待通过'
    WHEN 'rejected' THEN '客户未通过'
    WHEN 'op_reminded' THEN '运营已提醒客户'
    WHEN 'added' THEN '已添加'
    ELSE '未添加'
  END
WHERE add_status_legacy IS NULL OR add_status_legacy = '';

ALTER TABLE leads DROP COLUMN add_status;

ALTER TABLE leads
  CHANGE COLUMN add_status_legacy add_status VARCHAR(32) NOT NULL DEFAULT '未添加'
         COMMENT '添加状态(中文，已恢复)';

-- ============================================================
-- status 回滚
-- ============================================================

UPDATE leads SET status_legacy =
  CASE status
    WHEN 'new' THEN '新客资'
    WHEN 'assigned' THEN '已分配'
    WHEN 'in_followup' THEN '销售跟进中'
    WHEN 'in_collab' THEN '协同中'
    WHEN 'op_handling' THEN '运营处理中'
    WHEN 'contact_added' THEN '已添加通过'
    WHEN 'deal_closed' THEN '已成交'
    WHEN 'invalid' THEN '无效'
    ELSE '新客资'
  END
WHERE status_legacy IS NULL OR status_legacy = '';

ALTER TABLE leads DROP COLUMN status;

ALTER TABLE leads
  CHANGE COLUMN status_legacy status VARCHAR(32) NOT NULL DEFAULT '新客资'
         COMMENT '客资主状态(中文，已恢复)';
