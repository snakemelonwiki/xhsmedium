-- M36: 系统轻量配置表
-- 用于学习榜单展示门槛等少量业务配置。

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(128) PRIMARY KEY,
  setting_value TEXT         NOT NULL,
  updated_by    VARCHAR(64)  NULL,
  updated_at    TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统轻量配置表';
