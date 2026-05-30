-- ============================================================
-- M6: leads.add_status + leads.status 切换为英文 ENUM
--   旧值（中文 VARCHAR）→ 新值（英文 ENUM code）
--   原因：方案 §2.1 客资 status / §2.2 add_status 要求枚举统一英文 code，
--         避免前端 hardcode "已添加" / "新客资" 与后端口径漂移。
--   口径：
--     add_status: not_added / applied / pending / rejected / op_reminded / added
--     status:    new / assigned / in_followup / in_collab / op_handling
--                / contact_added / deal_closed / invalid
-- 前置：基础表已经由 schema.sql 创建，M1~M5 已应用
-- ⚠ 执行前必须停止 server.js 与 backend/ 服务（避免双写不一致）
-- ============================================================

USE lan_dual_role_system;

-- ============================================================
-- 6.1 add_status: 旧 VARCHAR(中文) → 英文 ENUM
-- ============================================================

ALTER TABLE leads
  CHANGE COLUMN add_status add_status_legacy VARCHAR(32) NULL
         COMMENT '旧添加状态(中文)，过渡期保留';

ALTER TABLE leads
  ADD COLUMN add_status
       ENUM('not_added','applied','pending','rejected','op_reminded','added')
       NOT NULL DEFAULT 'not_added'
       COMMENT '添加状态(英文 code)'
       AFTER add_status_legacy;

-- 6.2 add_status 数据回填
UPDATE leads SET add_status =
  CASE add_status_legacy
    WHEN '未添加' THEN 'not_added'
    WHEN '已申请添加' THEN 'applied'
    WHEN '客户未通过' THEN 'rejected'
    WHEN '运营已提醒客户' THEN 'op_reminded'
    WHEN '运营已提醒' THEN 'op_reminded'
    WHEN '已添加' THEN 'added'
    WHEN '已添加通过' THEN 'added'
    WHEN '待通过' THEN 'pending'
    ELSE 'not_added'
  END
WHERE add_status_legacy IS NOT NULL;

-- ============================================================
-- 6.3 status: 旧 VARCHAR(中文) → 英文 ENUM
-- ============================================================

ALTER TABLE leads
  CHANGE COLUMN status status_legacy VARCHAR(32) NULL
         COMMENT '旧主状态(中文)，过渡期保留';

ALTER TABLE leads
  ADD COLUMN status
       ENUM('new','assigned','in_followup','in_collab','op_handling','contact_added','deal_closed','invalid')
       NOT NULL DEFAULT 'new'
       COMMENT '客资主状态(英文 code)'
       AFTER status_legacy;

-- 6.4 status 数据回填
UPDATE leads SET status =
  CASE status_legacy
    WHEN '新客资' THEN 'new'
    WHEN '已分配' THEN 'assigned'
    WHEN '销售跟进中' THEN 'in_followup'
    WHEN '协同中' THEN 'in_collab'
    WHEN '运营处理中' THEN 'op_handling'
    WHEN '运营已处理' THEN 'in_followup'
    WHEN '已添加通过' THEN 'contact_added'
    WHEN '已成交' THEN 'deal_closed'
    WHEN 'deal_closed' THEN 'deal_closed'
    WHEN '无效' THEN 'invalid'
    ELSE 'new'
  END
WHERE status_legacy IS NOT NULL;
