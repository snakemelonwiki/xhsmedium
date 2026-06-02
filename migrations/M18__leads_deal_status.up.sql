-- ============================================================
-- M18: leads.deal_status 成交状态字段（P0 修复）
-- 背景：closeDeal 流程需要把"成交流水"写到 leads 上，但当前
--       leads 表缺少 deal_status 字段；orders 同步写入时无字段可写。
--       本迁移为 leads 增加 deal_status 字段，默认 'not_deal'，
--       枚举：not_deal / deal_pending / deal_done / refunded / invalid。
-- 配套代码：
--   backend/src/entities/lead.entity.ts（新增 dealStatus 列）
--   backend/src/modules/orders/orders.service.ts（closeDeal 事务内同步写）
--   backend/src/modules/leads/leads.service.ts（LEAD_STATUS_CODES 补 deal_done）
-- ============================================================

USE lan_dual_role_system;

ALTER TABLE leads
  ADD COLUMN deal_status VARCHAR(32) NOT NULL DEFAULT 'not_deal'
  COMMENT '成交状态：not_deal/deal_pending/deal_done/refunded/invalid';
