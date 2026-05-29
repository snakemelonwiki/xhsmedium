-- ============================================================
-- DDL: leads, lead_files, lead_follow_records
-- Database: lan_dual_role_system
-- Charset: utf8mb4 / Collate: utf8mb4_unicode_ci
-- ============================================================

-- Drop legacy leads table if migrating from the old schema
-- (Commented out by default; uncomment when running a full migration)
-- DROP TABLE IF EXISTS lead_follow_records;
-- DROP TABLE IF EXISTS lead_files;
-- DROP TABLE IF EXISTS leads;

CREATE TABLE IF NOT EXISTS leads (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform          VARCHAR(32)  NOT NULL COMMENT '来源平台: 小红书/抖音等',
  source_account_id BIGINT       NOT NULL COMMENT '来源账号ID, FK -> accounts.id',
  source_post_id    BIGINT       NULL     COMMENT '来源笔记/帖子ID, FK -> posts.id (可为空即非帖子来源)',
  operator_id       BIGINT       NOT NULL COMMENT '运营录入人, FK -> employees.id',
  sales_id          BIGINT       NULL     COMMENT '分配的销售人员, FK -> employees.id',
  nickname          VARCHAR(128) NULL     COMMENT '客户昵称',
  contact           VARCHAR(500) NOT NULL COMMENT '联系方式(可含多个: 微信号/手机/QQ等)',
  region            VARCHAR(128) NULL     COMMENT '客户地区/地域',
  requirement       TEXT         NULL     COMMENT '客户需求概要(预算/专业/周期等合并)',
  status            VARCHAR(32)  NOT NULL DEFAULT '新客资' COMMENT '客资状态: 新客资,已分配,销售跟进中,协同中,运营处理中,运营已处理,已添加通过,已成交,无效',
  add_status        VARCHAR(32)  NOT NULL DEFAULT '未添加' COMMENT '添加状态: 未添加,已申请添加,客户未通过,运营已提醒客户,已添加通过',
  deal_status       VARCHAR(32)  NULL     COMMENT '成交状态: 成交/未成交等(成交金额移至orders表)',
  note              TEXT         NULL     COMMENT '备注',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_leads_operator_id        (operator_id),
  INDEX idx_leads_sales_id            (sales_id),
  INDEX idx_leads_source_account_id   (source_account_id),
  INDEX idx_leads_source_post_id      (source_post_id),
  INDEX idx_leads_status              (status),
  INDEX idx_leads_add_status          (add_status),
  INDEX idx_leads_created_at          (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资线索表';

-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_files (
  id           BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id      BIGINT        NOT NULL COMMENT '所属客资, FK -> leads.id',
  file_url     VARCHAR(500)  NOT NULL COMMENT '文件存储路径/URL',
  file_type    VARCHAR(32)   NOT NULL DEFAULT 'image' COMMENT '文件类型: image, screenshot, document等',
  uploaded_by  BIGINT        NOT NULL COMMENT '上传人, FK -> employees.id',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_lead_files_lead_id    (lead_id),
  INDEX idx_lead_files_uploaded_by (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资附件/截图表';

-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_follow_records (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_id         BIGINT       NOT NULL COMMENT '所属客资, FK -> leads.id',
  sales_id        BIGINT       NOT NULL COMMENT '跟进销售, FK -> employees.id',
  follow_type     VARCHAR(32)  NOT NULL COMMENT '跟进方式: 电话,微信,面谈,其他等',
  content         TEXT         NULL     COMMENT '跟进内容详情',
  next_follow_at  DATETIME     NULL     COMMENT '计划下次跟进时间',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '仅created_at, 不可变记录无updated_at',

  INDEX idx_lead_follow_records_lead_id    (lead_id),
  INDEX idx_lead_follow_records_sales_id   (sales_id),
  INDEX idx_lead_follow_records_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资跟进记录表(不可变)';