-- ============================================================
-- M4 回滚：把 lead_follow_records / lead_files 还原到 ddl/03 的 BIGINT 风格
-- ⚠ 数据丢失（这两表本就为空）
-- ============================================================

USE lan_dual_role_system;

DROP TABLE IF EXISTS lead_follow_records;
DROP TABLE IF EXISTS lead_files;

CREATE TABLE lead_follow_records (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id         BIGINT       NOT NULL,
  sales_id        BIGINT       NOT NULL,
  follow_type     VARCHAR(32)  NOT NULL,
  content         TEXT         NULL,
  next_follow_at  DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lead_files (
  id           BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id      BIGINT        NOT NULL,
  file_url     VARCHAR(500)  NOT NULL,
  file_type    VARCHAR(32)   NOT NULL DEFAULT 'image',
  uploaded_by  BIGINT        NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
