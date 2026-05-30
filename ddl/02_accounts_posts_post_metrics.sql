-- ============================================================
-- DDL: accounts, posts, post_metrics
-- Database: lan_dual_role_system (utf8mb4 / utf8mb4_unicode_ci)
-- ============================================================

CREATE TABLE IF NOT EXISTS accounts (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  owner_employee_id BIGINT       NOT NULL COMMENT '负责该账号的员工ID',
  platform          VARCHAR(32)  NOT NULL COMMENT '平台：小红书/抖音等',
  profile_url       VARCHAR(500) NULL     COMMENT '账号主页链接',
  account_name      VARCHAR(128) NOT NULL COMMENT '账号名称',
  account_uid       VARCHAR(128) NULL     COMMENT '平台UID',
  persona           VARCHAR(255) NULL     COMMENT '人设',
  positioning       VARCHAR(255) NULL     COMMENT '定位',
  posting_plan      TEXT         NULL     COMMENT '发文计划',
  status            VARCHAR(32)  NOT NULL DEFAULT '正常' COMMENT '账号状态',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  INDEX idx_accounts_owner_employee_id (owner_employee_id),
  INDEX idx_accounts_platform          (platform),
  INDEX idx_accounts_status            (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运营账号表';


CREATE TABLE IF NOT EXISTS posts (
  id                BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  platform          VARCHAR(32)   NOT NULL COMMENT '平台：小红书/抖音等',
  account_id        BIGINT        NOT NULL COMMENT '所属运营账号ID',
  employee_id       BIGINT        NOT NULL COMMENT '发布员工ID',
  title             VARCHAR(255)  NOT NULL COMMENT '作品标题',
  content           TEXT          NULL     COMMENT '文案内容',
  cover_url         VARCHAR(500)  NULL     COMMENT '封面图URL',
  post_url          VARCHAR(500)  NULL     COMMENT '作品链接',
  post_type         VARCHAR(32)   NOT NULL COMMENT '作品类型',
  is_lead_post      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否引流帖：0=否 1=是',
  publish_time      DATETIME      NOT NULL COMMENT '发布时间',
  status            VARCHAR(32)   NOT NULL DEFAULT '有效' COMMENT '作品状态',
  note              TEXT          NULL     COMMENT '备注',
  supervisor_suggestion TEXT      NULL     COMMENT '主管建议',
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  -- 索引（9.1节要求；因组合索引列宽限制，拆为单独索引）
  INDEX idx_posts_employee_id   (employee_id),
  INDEX idx_posts_account_id    (account_id),
  INDEX idx_posts_platform      (platform),
  INDEX idx_posts_publish_time  (publish_time),
  INDEX idx_posts_post_type     (post_type),
  INDEX idx_posts_status        (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品帖子表';


CREATE TABLE IF NOT EXISTS post_metrics (
  id           BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  post_id      BIGINT   NOT NULL COMMENT '作品ID',
  date         DATE     NOT NULL COMMENT '指标日期（每日快照）',
  likes        BIGINT   NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments     BIGINT   NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites    BIGINT   NOT NULL DEFAULT 0 COMMENT '收藏数',
  shares       BIGINT   NOT NULL DEFAULT 0 COMMENT '分享数',
  collected_at DATETIME NOT NULL COMMENT '指标采集时间',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

  -- 9.1节：post_id + date 唯一索引，防止同一天重复写入指标
  UNIQUE INDEX idx_post_metrics_post_date (post_id, date),
  INDEX idx_post_metrics_post_id          (post_id),
  INDEX idx_post_metrics_date             (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品指标表';