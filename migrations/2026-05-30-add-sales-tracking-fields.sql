-- ============================================================
-- Migration: 2026-05-30 销售跟进与客资管理字段补充
-- 对应需求文档: doc/运营中台四端口-当前问题.md 第七节
-- ============================================================

USE lan_dual_role_system;

-- ============================================================
-- 1. leads 表字段补充检查
-- 注意: 大部分字段已在 schema.sql 中存在，此处仅确保完整性
-- ============================================================

-- 检查并添加 lead_code (客资唯一编号)
ALTER TABLE leads
  MODIFY COLUMN lead_code VARCHAR(32) NULL COMMENT '客资唯一编号，格式：L20260528-0001';

-- 检查并添加 intention_level (意向度)
ALTER TABLE leads
  MODIFY COLUMN intention_level VARCHAR(16) NOT NULL DEFAULT 'pending'
  COMMENT '意向度：high/mid/low/invalid/pending';

-- 检查并添加 process_status (处理状态)
ALTER TABLE leads
  MODIFY COLUMN process_status VARCHAR(32) NOT NULL DEFAULT 'not_contacted'
  COMMENT '处理状态：未联系/待通过/已通过/沟通中/已报价/已成交/无效';

-- 检查并添加 add_method (添加方式)
ALTER TABLE leads
  MODIFY COLUMN add_method VARCHAR(16) NOT NULL DEFAULT 'unknown'
  COMMENT '添加方式：主动添加/被动添加/客户主动加/未知';

-- 检查并添加 matched_post_id (绑定来源作品ID)
ALTER TABLE leads
  MODIFY COLUMN matched_post_id VARCHAR(64) NULL
  COMMENT '匹配作品ID，用于绑定来源作品';

-- 检查并添加 next_follow_time (下次跟进时间)
ALTER TABLE leads
  MODIFY COLUMN next_follow_time DATETIME NULL
  COMMENT '下次跟进时间';

-- ============================================================
-- 2. 创建 post_metrics_history 表 (作品指标刷新历史表)
-- 用于记录每次手动刷新作品指标的历史数据
-- ============================================================

CREATE TABLE IF NOT EXISTS post_metrics_history (
  id              VARCHAR(64)  PRIMARY KEY,
  post_id         VARCHAR(64)  NOT NULL COMMENT '作品ID',
  likes           BIGINT       NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments        BIGINT       NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites       BIGINT       NOT NULL DEFAULT 0 COMMENT '收藏数',
  shares          BIGINT       NOT NULL DEFAULT 0 COMMENT '分享数',
  leads_count     BIGINT       NOT NULL DEFAULT 0 COMMENT '获客数',
  refreshed_by    VARCHAR(64)  NULL COMMENT '刷新操作人ID',
  refresh_type    VARCHAR(32)  NOT NULL DEFAULT 'manual' COMMENT '刷新类型：manual/auto',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '刷新时间',

  INDEX idx_metrics_history_post_id (post_id),
  INDEX idx_metrics_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='作品指标刷新历史表';

-- ============================================================
-- 3. 确认其他必需表已存在
-- 以下表已在 schema.sql 中定义，此处仅作确认注释
-- ============================================================

-- lead_follow_records (销售跟进记录表) - 已存在
-- lead_drafts (录入草稿表) - 已存在
-- favorites (收藏表) - 已存在
-- import_tasks (批量导入记录表) - 已存在

-- ============================================================
-- 4. 添加索引优化
-- ============================================================

-- 为 leads 表添加 matched_post_id 索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_leads_matched_post_id ON leads(matched_post_id);

-- 为 leads 表添加 next_follow_time 索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_time ON leads(next_follow_time);

-- ============================================================
-- Migration 完成
-- ============================================================
