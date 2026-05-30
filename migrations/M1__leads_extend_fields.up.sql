-- ============================================================
-- M1: leads 表扩展字段
--   新增 6 列：lead_code, intention_level, add_method,
--             next_follow_time, matched_post_id, source_unknown
--   迁移 1 列：process_status (VARCHAR → ENUM 英文 code)
-- 适用：lan_dual_role_system schema 0.2.x
-- 前置：基础表已经由 schema.sql 创建
-- ⚠ 执行前必须停止 server.js 与 backend/ 服务（避免双写不一致）
-- ============================================================

USE lan_dual_role_system;

-- 1.1 新增字段
ALTER TABLE leads
  ADD COLUMN lead_code        VARCHAR(32) NULL
             COMMENT '客资唯一编号 L<YYYYMMDD>-<NNNN>，由 backfill-lead-code.js 生成'
             AFTER id,
  ADD COLUMN intention_level  ENUM('high','mid','low','invalid','pending')
             NOT NULL DEFAULT 'pending'
             COMMENT '意向度（统一英文 code）'
             AFTER intention,
  ADD COLUMN add_method       ENUM('active','passive','customer_init','unknown')
             NOT NULL DEFAULT 'unknown'
             COMMENT '添加方式：主动/被动/客户主动加/未知'
             AFTER add_status,
  ADD COLUMN next_follow_time DATETIME NULL
             COMMENT '下次跟进时间',
  ADD COLUMN matched_post_id  VARCHAR(64) NULL
             COMMENT '绑定来源作品ID（被动添加时使用）'
             AFTER post_id,
  ADD COLUMN source_unknown   TINYINT(1) NOT NULL DEFAULT 0
             COMMENT '被动添加来源未知，待运营确认（1/0）';

-- 1.2 process_status：旧 VARCHAR 列改名归档，新 ENUM 列接管
ALTER TABLE leads
  CHANGE COLUMN process_status process_status_legacy VARCHAR(32) NULL
         COMMENT '旧处理状态(中文)，30天后由后续 milestone 删除';

ALTER TABLE leads
  ADD COLUMN process_status
       ENUM('not_contacted','applied','pending','passed','chatting','quoted','closed','invalid')
       NOT NULL DEFAULT 'not_contacted'
       COMMENT '处理状态（统一英文 code）'
       AFTER process_status_legacy;

-- 1.3 索引
ALTER TABLE leads
  ADD INDEX idx_leads_intention_level (intention_level),
  ADD INDEX idx_leads_add_method      (add_method),
  ADD INDEX idx_leads_matched_post_id (matched_post_id),
  ADD INDEX idx_leads_next_follow     (next_follow_time);

-- lead_code 的 UNIQUE 索引在 backfill-lead-code.js 回填完成后由其自身添加。
-- 这样可以在历史空值阶段不阻塞写入。
