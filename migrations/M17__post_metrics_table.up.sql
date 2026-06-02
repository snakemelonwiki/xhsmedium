-- ============================================================
-- M17: post_metrics 指标采集表（P1 性能数据底座）
-- 来源：doc/B端-测试用例数据核查报告.md §6.1 / doc/B端-测试执行结果-性能.md TC-PERF-025
-- 历史背景：schema.sql 当前只有 post_metrics_history（指标历史快照），
--           但缺一份"按作品 + 日期维度聚合"的指标表，
--           TC-PERF-025 / 学习榜单 / 流量榜 / 主管端"近期爆款"等
--           排行类查询都依赖 post_metrics。
-- 性能：idx_metrics_post_collected(post_id, date) 复合唯一索引
--       配合 posts.id 的主键覆盖单作品历史走势 / 区间聚合。
-- 配套代码：
--   backend/src/entities/post-metrics.entity.ts （待补）
--   backend/src/modules/rankings/rankings.service.ts （使用方）
-- ============================================================

USE lan_dual_role_system;

CREATE TABLE IF NOT EXISTS post_metrics (
  id          VARCHAR(64)  NOT NULL                  COMMENT '主键（UUID）',
  post_id     VARCHAR(64)  NOT NULL                  COMMENT '关联 posts.id（小红书 / 抖音作品）',
  date        DATE         NOT NULL                  COMMENT '指标收集日期（按天聚合）',
  likes       BIGINT       NOT NULL DEFAULT 0       COMMENT '点赞数',
  comments    BIGINT       NOT NULL DEFAULT 0       COMMENT '评论数',
  favorites   BIGINT       NOT NULL DEFAULT 0       COMMENT '收藏数',
  shares      BIGINT       NOT NULL DEFAULT 0       COMMENT '分享数',
  traffic     BIGINT       NOT NULL DEFAULT 0       COMMENT '来源流量（仅获客贴 / 营销贴）',
  views       BIGINT       NOT NULL DEFAULT 0       COMMENT '浏览数（可选）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  PRIMARY KEY (id),

  -- 复合唯一索引：单作品某日只能有一条指标记录（采集任务按天 upsert）
  -- 同时支撑排行榜按"作品 + 日期区间"聚合 / 排序
  UNIQUE KEY idx_metrics_post_collected (post_id, date),

  -- 单独日期索引支撑"今日榜单"（date 单列等值 / 范围）
  KEY idx_metrics_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='作品指标按天聚合表（学习榜单 / 流量榜 / 近期爆款基表）';
