-- M35: 作品广场门槛配置表（对应 schema.sql 增量）
-- 涉及任务：T8/T9 作品广场门槛配置模块

CREATE TABLE IF NOT EXISTS plaza_configs (
  id           VARCHAR(64)  PRIMARY KEY,
  config_key   VARCHAR(64)  NOT NULL UNIQUE COMMENT '配置键',
  config_value TEXT         NOT NULL        COMMENT '配置值（JSON 或数值字符串）',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_plaza_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品广场门槛配置表';
