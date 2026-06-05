-- ============================================================
-- 抓取告警表 (scraping_alerts)
-- v1.4 抓取稳定性改造：
--   - 全局抓取锁 + 失败告警入库
--   - 仅 owner 角色可通过 /api/scraping-alerts 查看
-- ============================================================

USE lan_dual_role_system;

-- 抓取告警表
CREATE TABLE IF NOT EXISTS scraping_alerts (
  id            VARCHAR(64)   PRIMARY KEY,
  level         VARCHAR(32)   NOT NULL                COMMENT 'info / warn / error',
  platform      VARCHAR(32)   NULL                    COMMENT '小红书 / 抖音 / null（platform_unsupported 时为 null）',
  source        VARCHAR(64)   NOT NULL                COMMENT 'fetch-metrics / refresh-metrics / parse-link',
  event_code    VARCHAR(64)   NOT NULL                COMMENT 'streak_3 / total_10 / total_30 / total_50 / total_100（避开 MySQL 保留字 trigger）',
  post_id       VARCHAR(64)   NULL                    COMMENT '关联作品 ID',
  post_url      TEXT          NULL                    COMMENT '原始 URL（整链）',
  error_code    VARCHAR(64)   NULL                    COMMENT 'parser-core.classifyError 的 code',
  error_message TEXT          NULL                    COMMENT '错误原文',
  fail_streak   INT           NOT NULL DEFAULT 0      COMMENT '触发告警时的连续失败次数',
  total_failed  INT           NOT NULL DEFAULT 0      COMMENT '触发告警时的累计失败次数',
  context       TEXT          NULL                    COMMENT 'JSON.stringify 的额外信息（retry/timeout/retryable...）',
  resolved      TINYINT       NOT NULL DEFAULT 0      COMMENT '0 未处理 / 1 已处理',
  resolved_at   DATETIME      NULL                    COMMENT '处理时间',
  resolved_by   VARCHAR(64)   NULL                    COMMENT '处理人（owner 用户 id）',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_sa_created           (created_at),
  INDEX idx_sa_level_created     (level, created_at),
  INDEX idx_sa_resolved_created  (resolved, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抓取告警表（owner 专属）';
