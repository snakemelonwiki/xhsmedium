CREATE DATABASE IF NOT EXISTS lan_dual_role_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lan_dual_role_system;

-- ============================================================
-- 1. employees (员工表)
-- 与实体一致: id VARCHAR(64), 保留 hire_date/schema.sql 原字段
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id              VARCHAR(64)  PRIMARY KEY,
  employee_code   VARCHAR(32)  NOT NULL UNIQUE COMMENT '员工编号，唯一标识',
  name            VARCHAR(64)  NOT NULL              COMMENT '员工姓名',
  phone           VARCHAR(64)  NULL                  COMMENT '联系电话',
  hire_date       DATE         NULL                  COMMENT '入职日期',
  status          VARCHAR(32)  NOT NULL DEFAULT '在职' COMMENT '在职/离职/休假等',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工信息表';

-- ============================================================
-- 2. users (用户表)
-- 与实体一致: id VARCHAR(64), role 扩展为五角色, employee_id VARCHAR(64)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(64)  PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL UNIQUE       COMMENT '登录用户名，唯一',
  password        VARCHAR(255) NOT NULL              COMMENT '登录密码',
  role            VARCHAR(32)  NOT NULL DEFAULT 'staff' COMMENT '角色: admin/staff/sales/owner/academic/operations/supervisor',
  employee_id     VARCHAR(64)  NULL                  COMMENT '关联员工ID',
  status          VARCHAR(32)  NOT NULL DEFAULT 'active' COMMENT 'active/inactive/locked',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_username       (username),
  INDEX idx_users_role           (role),
  INDEX idx_users_employee_id    (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户账号表';

-- ============================================================
-- 3. accounts (运营账号表)
-- 与实体一致: id VARCHAR(64), employee_id VARCHAR(64)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id                VARCHAR(64)  PRIMARY KEY,
  employee_id       VARCHAR(64)  NOT NULL COMMENT '负责该账号的员工ID',
  platform          VARCHAR(32)  NOT NULL COMMENT '平台: 小红书/抖音等',
  profile_url       VARCHAR(500) NULL     COMMENT '账号主页链接',
  account_name      VARCHAR(128) NOT NULL COMMENT '账号名称',
  account_uid       VARCHAR(128) NULL     COMMENT '平台UID',
  persona           VARCHAR(255) NULL     COMMENT '人设',
  positioning       VARCHAR(255) NULL     COMMENT '定位',
  posting_plan      TEXT         NULL     COMMENT '发文计划',
  status            VARCHAR(32)  NOT NULL DEFAULT '正常' COMMENT '账号状态',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_accounts_employee_id  (employee_id),
  INDEX idx_accounts_platform     (platform),
  INDEX idx_accounts_status       (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运营账号表';

-- ============================================================
-- 4. posts (作品帖子表)
-- 与实体一致: id VARCHAR(64), 保留 traffic/likes/comments/favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id                VARCHAR(64)  PRIMARY KEY,
  employee_id       VARCHAR(64)  NOT NULL COMMENT '发布员工ID',
  account_id        VARCHAR(64)  NOT NULL COMMENT '所属运营账号ID',
  platform          VARCHAR(32)  NOT NULL COMMENT '平台: 小红书/抖音等',
  title             VARCHAR(255) NOT NULL COMMENT '作品标题',
  copywriting       TEXT         NULL     COMMENT '文案内容',
  cover_image_url   VARCHAR(500) NULL     COMMENT '封面图URL',
  post_url          VARCHAR(500) NULL     COMMENT '作品链接',
  post_type         VARCHAR(32)  NOT NULL COMMENT '作品类型',
  traffic           BIGINT       NOT NULL DEFAULT 0 COMMENT '浏览量',
  likes             BIGINT       NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments          BIGINT       NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites         BIGINT       NOT NULL DEFAULT 0 COMMENT '收藏数',
  metrics_updated_at DATETIME   NULL     COMMENT '指标更新时间',
  published_at      DATE         NOT NULL COMMENT '发布日期',
  note              TEXT         NULL     COMMENT '备注',
  supervisor_suggestion TEXT     NULL     COMMENT '主管建议',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_posts_employee_id   (employee_id),
  INDEX idx_posts_account_id    (account_id),
  INDEX idx_posts_platform      (platform),
  INDEX idx_posts_published_at  (published_at),
  INDEX idx_posts_post_type     (post_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品帖子表';

-- ============================================================
-- 5. post_metrics (作品指标表 - 按日快照)
-- 与 TypeORM PostMetricsHistory 实体对应
-- ============================================================
CREATE TABLE IF NOT EXISTS post_metrics (
  id           VARCHAR(64)  PRIMARY KEY,
  post_id      VARCHAR(64)  NOT NULL COMMENT '作品ID',
  date         DATE         NOT NULL COMMENT '指标日期(每日快照)',
  likes        BIGINT       NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments     BIGINT       NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites    BIGINT       NOT NULL DEFAULT 0 COMMENT '收藏数',
  shares       BIGINT       NOT NULL DEFAULT 0 COMMENT '分享数',
  leads_count  BIGINT       NOT NULL DEFAULT 0 COMMENT '获客数',
  collected_at DATETIME     NOT NULL COMMENT '指标采集时间',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_post_metrics_post_date (post_id, date),
  INDEX idx_post_metrics_post_id          (post_id),
  INDEX idx_post_metrics_date             (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品指标日快照表';

-- ============================================================
-- 6. leads (客资线索表)
-- 与 TypeORM Lead 实体完全一致
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                VARCHAR(64)  PRIMARY KEY,
  employee_id       VARCHAR(64)  NOT NULL COMMENT '录入员工ID',
  account_id        VARCHAR(64)  NOT NULL COMMENT '来源账号ID',
  post_id           VARCHAR(64)  NULL     COMMENT '来源作品ID',
  platform          VARCHAR(32)  NOT NULL COMMENT '来源平台',
  contact_info      VARCHAR(255) NOT NULL COMMENT '联系方式',
  nickname          VARCHAR(128) NULL     COMMENT '客户昵称',
  budget            VARCHAR(64)  NULL     COMMENT '预算',
  major_content     VARCHAR(255) NULL     COMMENT '专业/需求',
  ip                VARCHAR(128) NULL     COMMENT 'IP地址',
  status            VARCHAR(32)  NOT NULL DEFAULT '新客资' COMMENT '客资状态',
  deal_amount       DECIMAL(12,2) NULL    COMMENT '成交金额',
  note              TEXT         NULL     COMMENT '备注',
  capture_image_url VARCHAR(500) NULL     COMMENT '截图URL',
  sales_feedback    TEXT         NULL     COMMENT '销售反馈',
  sales_updated_at  DATETIME     NULL     COMMENT '销售更新时间',
  sales_user_name   VARCHAR(64)  NULL     COMMENT '销售用户名',
  assigned_sales_user_id   VARCHAR(64) NULL COMMENT '分配销售ID',
  assigned_sales_user_name VARCHAR(64) NULL COMMENT '分配销售名称',
  process_status    VARCHAR(32)  NOT NULL DEFAULT 'not_contacted' COMMENT '处理状态',
  add_status        VARCHAR(32)  NOT NULL DEFAULT 'not_added' COMMENT '添加状态',
  intention         VARCHAR(32)  NULL     COMMENT '意向',
  lead_code         VARCHAR(32)  NULL     COMMENT '客资编号',
  intention_level   VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '意向度等级',
  add_method        VARCHAR(16)  NOT NULL DEFAULT 'unknown' COMMENT '添加方式',
  next_follow_time  DATETIME     NULL     COMMENT '下次跟进时间',
  matched_post_id   VARCHAR(64)  NULL     COMMENT '匹配作品ID',
  source_unknown    TINYINT      NOT NULL DEFAULT 0 COMMENT '来源未知',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_leads_employee_id           (employee_id),
  INDEX idx_leads_account_id            (account_id),
  INDEX idx_leads_post_id               (post_id),
  INDEX idx_leads_platform              (platform),
  INDEX idx_leads_status                (status),
  INDEX idx_leads_process_status        (process_status),
  INDEX idx_leads_add_status            (add_status),
  INDEX idx_leads_assigned_sales_user_id(assigned_sales_user_id),
  INDEX idx_leads_lead_code             (lead_code),
  INDEX idx_leads_created_at            (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资线索表';

-- ============================================================
-- 7. lead_follow_records (客资跟进记录表)
-- 与 TypeORM LeadFollowRecord 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_follow_records (
  id              VARCHAR(64)  PRIMARY KEY,
  lead_id         VARCHAR(64)  NOT NULL COMMENT '所属客资ID',
  user_id         VARCHAR(64)  NOT NULL COMMENT '跟进用户ID',
  follow_type     VARCHAR(32)  NOT NULL DEFAULT '微信' COMMENT '跟进方式',
  content         TEXT         NULL     COMMENT '跟进内容',
  next_follow_time DATETIME    NULL     COMMENT '下次跟进时间',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_follow_lead_id (lead_id),
  INDEX idx_follow_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资跟进记录表';

-- ============================================================
-- 8. lead_drafts (客资草稿表)
-- 与 TypeORM LeadDraft 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_drafts (
  id              VARCHAR(64)  PRIMARY KEY,
  user_id         VARCHAR(64)  NOT NULL COMMENT '用户ID',
  draft_type      VARCHAR(32)  NOT NULL COMMENT '草稿类型: leads/posts等',
  content_json    TEXT         NOT NULL COMMENT '草稿内容JSON',
  image_urls      JSON         NULL     COMMENT '关联图片URL数组',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_drafts_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资录入草稿表';

-- ============================================================
-- 9. collaboration_tasks (协同任务表)
-- 与 TypeORM CollaborationTask 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id              VARCHAR(64)  PRIMARY KEY,
  lead_id         VARCHAR(64)  NOT NULL COMMENT '关联客资ID',
  requester_id    VARCHAR(64)  NOT NULL COMMENT '发起人ID',
  handler_id      VARCHAR(64)  NULL     COMMENT '处理人ID',
  type            VARCHAR(32)  NOT NULL COMMENT '协作类型',
  reason          TEXT         NULL     COMMENT '协作原因',
  status          VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '状态: pending/handling/handled/closed',
  handled_note    TEXT         NULL     COMMENT '处理备注',
  requested_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at      DATETIME     NULL     COMMENT '处理完成时间',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_collab_lead_id      (lead_id),
  INDEX idx_collab_requester_id (requester_id),
  INDEX idx_collab_handler_id   (handler_id),
  INDEX idx_collab_status       (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协同任务表';

-- ============================================================
-- 10. orders (订单表)
-- 与 TypeORM Order 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                VARCHAR(64)  PRIMARY KEY,
  lead_id           VARCHAR(64)  NOT NULL COMMENT '关联客资ID',
  sales_user_id     VARCHAR(64)  NOT NULL COMMENT '销售用户ID',
  academic_user_id  VARCHAR(64)  NULL     COMMENT '教务用户ID',
  service_type      VARCHAR(64)  NULL     COMMENT '服务类型',
  amount            DECIMAL(12,2) NULL    COMMENT '成交金额',
  paid_status       VARCHAR(32)  NOT NULL DEFAULT 'unpaid' COMMENT '付款状态: unpaid/partial/paid',
  order_status      VARCHAR(32)  NOT NULL DEFAULT 'to_receive' COMMENT '订单状态',
  remark            TEXT         NULL     COMMENT '备注',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_orders_lead_id          (lead_id),
  INDEX idx_orders_sales_user_id    (sales_user_id),
  INDEX idx_orders_academic_user_id (academic_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- ============================================================
-- 11. order_follow_records (订单跟进记录表)
-- 与 TypeORM OrderFollowRecord 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS order_follow_records (
  id              VARCHAR(64)  PRIMARY KEY,
  order_id        VARCHAR(64)  NOT NULL COMMENT '关联订单ID',
  user_id         VARCHAR(64)  NOT NULL COMMENT '跟进用户ID',
  node_type       VARCHAR(32)  NOT NULL COMMENT '节点类型',
  content         TEXT         NULL     COMMENT '跟进内容',
  next_remind_at  DATETIME     NULL     COMMENT '下次提醒时间',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_order_follow_order_id (order_id),
  INDEX idx_order_follow_user_id  (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单跟进记录表';

-- ============================================================
-- 12. notifications (通知表)
-- 与 TypeORM Notification 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                VARCHAR(64)  PRIMARY KEY,
  receiver_id       VARCHAR(64)  NOT NULL COMMENT '接收者ID',
  sender_id         VARCHAR(64)  NULL     COMMENT '发送者ID',
  port_type         VARCHAR(32)  NOT NULL COMMENT '端口类型: operations/sales/academic',
  type_code         VARCHAR(64)  NOT NULL COMMENT '通知类型代码',
  title             VARCHAR(255) NOT NULL COMMENT '通知标题',
  content           TEXT         NULL     COMMENT '通知内容',
  related_id        VARCHAR(64)  NULL     COMMENT '关联业务ID',
  related_type      VARCHAR(32)  NULL     COMMENT '关联类型',
  read_status       TINYINT      NOT NULL DEFAULT 0 COMMENT '0未读 1已读',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_notify_receiver_id   (receiver_id),
  INDEX idx_notify_read_status   (read_status),
  INDEX idx_notify_type_code     (type_code),
  INDEX idx_notify_created_at    (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表';

-- ============================================================
-- 13. import_tasks (导入任务表)
-- 与 TypeORM ImportTask 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS import_tasks (
  id              VARCHAR(64)  PRIMARY KEY,
  import_type     VARCHAR(32)  NOT NULL COMMENT '导入类型: leads/posts',
  user_id         VARCHAR(64)  NOT NULL COMMENT '发起人ID',
  total_count     INT          NOT NULL DEFAULT 0 COMMENT '总行数',
  success_count   INT          NOT NULL DEFAULT 0 COMMENT '成功数',
  fail_count      INT          NOT NULL DEFAULT 0 COMMENT '失败数',
  error_file_url  VARCHAR(500) NULL     COMMENT '错误文件URL',
  status          VARCHAR(32)  NOT NULL DEFAULT 'processing' COMMENT '状态: processing/done',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME     NULL     COMMENT '完成时间',

  INDEX idx_import_user_id (user_id),
  INDEX idx_import_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导入任务表';

-- ============================================================
-- 14. operation_logs (操作日志表)
-- 与 TypeORM OperationLog 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_logs (
  id              VARCHAR(64)  PRIMARY KEY,
  user_id         VARCHAR(64)  NOT NULL COMMENT '操作用户ID',
  action          VARCHAR(64)  NOT NULL COMMENT '操作动作',
  target_type     VARCHAR(32)  NOT NULL COMMENT '目标类型',
  target_id       VARCHAR(64)  NOT NULL COMMENT '目标ID',
  detail          TEXT         NULL     COMMENT '变更详情',
  ip              VARCHAR(45)  NULL     COMMENT '客户端IP',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_oplog_user_id     (user_id),
  INDEX idx_oplog_target_type (target_type),
  INDEX idx_oplog_target_id   (target_id),
  INDEX idx_oplog_action      (action),
  INDEX idx_oplog_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志审计表';

-- ============================================================
-- 15. exports (导出任务表)
-- 与 TypeORM ExportTask 实体一致
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id              VARCHAR(64)  PRIMARY KEY,
  user_id         VARCHAR(64)  NOT NULL COMMENT '发起用户ID',
  export_type     VARCHAR(32)  NOT NULL COMMENT '导出类型',
  filter_json     TEXT         NULL     COMMENT '筛选条件JSON',
  file_url        VARCHAR(500) NULL     COMMENT '生成文件URL',
  status          VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '状态: pending/processing/completed/failed',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at     DATETIME     NULL     COMMENT '完成时间',
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_exports_user_id   (user_id),
  INDEX idx_exports_status    (status),
  INDEX idx_exports_created_at(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导出任务表';

-- ============================================================
-- 16. favorites (收藏表)
-- 与 TypeORM Favorite 实体对应
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id              VARCHAR(64)  PRIMARY KEY,
  user_id         VARCHAR(64)  NOT NULL COMMENT '用户ID',
  target_type     VARCHAR(32)  NOT NULL COMMENT '目标类型: post/account',
  target_id       VARCHAR(64)  NOT NULL COMMENT '目标ID',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_fav_user_target (user_id, target_type, target_id),
  INDEX idx_fav_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏表';
