-- ============================================================
-- Migration: post_metrics 表增加 collected_at 字段
-- 用途：记录指标实际采集时间（精确到秒），与 date（按天聚合）字段配合使用
-- 对应实体：backend/src/entities/post-metrics.entity.ts
-- 对应 schema.sql 2026-06-24 更新
-- ============================================================

ALTER TABLE post_metrics ADD COLUMN collected_at DATETIME NOT NULL COMMENT '指标采集时间（精确到秒）' AFTER date;
