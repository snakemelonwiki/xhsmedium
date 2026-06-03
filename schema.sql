CREATE DATABASE IF NOT EXISTS lan_dual_role_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lan_dual_role_system;

-- ============================================================
-- 0. _migrations
-- scripts/run-migrations.js 使用的迁移登记表。
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id          VARCHAR(64)  PRIMARY KEY,
  filename    VARCHAR(255) NOT NULL,
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移记录表';

-- ============================================================
-- 1. employees
-- backend/src/entities/employee.entity.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id             VARCHAR(64) PRIMARY KEY,
  employee_code  VARCHAR(32) NOT NULL UNIQUE COMMENT '员工编号',
  name           VARCHAR(64) NOT NULL COMMENT '员工姓名',
  phone          VARCHAR(64) NULL COMMENT '联系电话',
  hire_date      DATE        NULL COMMENT '入职日期',
  status         VARCHAR(32) NOT NULL DEFAULT '在职' COMMENT '员工状态',
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工信息表';

-- ============================================================
-- 2. users
-- backend/src/entities/user.entity.ts + auth/app role routing.
-- 角色 → 前端入口：
--   admin    → /admin/*   主管端（运营管理，跨员工聚合视图）
--   staff    → /operation/* 运营员工端（portType='operations'）
--   owner    → 仅 OWNER_PORT（默认 3001）登录的总后台
--   sales    → /sales/*   销售端
--   academic → /academic/* 教务端
-- role 保持 ENUM 类型（原始 schema 定义），通过追加枚举值的方式扩展 owner/sales/academic；
-- 不可删除已有枚举值、不可修改字段类型；新增角色需同步 user.entity.ts 与迁移（参考 M5）。
-- 迁移来源：M5（role 增加 owner/sales/academic 枚举值）、M12（刷新全部列注释）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           VARCHAR(64)  PRIMARY KEY                        COMMENT '用户唯一ID（UUID）',
  username     VARCHAR(64)  NOT NULL UNIQUE                    COMMENT '登录用户名（全局唯一）',
  password     VARCHAR(255) NOT NULL                           COMMENT '登录密码：bcrypt hash 或历史明文',
  role         ENUM('admin','staff','owner','sales','academic','operation','supervisor') NOT NULL
                                                                COMMENT '账号角色：admin/supervisor主管 | staff/operation运营员工 | owner总后台 | sales销售 | academic教务',
  failed_login_count INT NOT NULL DEFAULT 0 COMMENT '登录失败次数（>=5次触发账号锁定）',
  last_failed_at    DATETIME NULL COMMENT '最近一次登录失败时间（UTC），成功登录后重置为NULL',
  employee_id  VARCHAR(64)  NULL                               COMMENT '关联员工ID（employees.id）；owner 等纯账号可为空',
  status       VARCHAR(32)  NOT NULL DEFAULT 'active'          COMMENT '账号状态：active正常 | inactive停用 | locked锁定',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '账号创建时间',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                                                                COMMENT '账号最后更新时间',

  INDEX idx_users_role        (role),
  INDEX idx_users_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户账号表（按 role 区分前端入口与数据范围）';

-- ============================================================
-- 3. accounts
-- backend/src/entities/account.entity.ts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id            VARCHAR(64)  PRIMARY KEY,
  employee_id   VARCHAR(64)  NOT NULL COMMENT '负责员工ID',
  platform      VARCHAR(32)  NOT NULL COMMENT '平台',
  profile_url   VARCHAR(500) NULL COMMENT '账号主页链接',
  account_name  VARCHAR(128) NOT NULL COMMENT '账号名称',
  account_uid   VARCHAR(128) NULL COMMENT '平台UID',
  persona       VARCHAR(255) NULL COMMENT '人设',
  positioning   VARCHAR(255) NULL COMMENT '定位',
  posting_plan  TEXT         NULL COMMENT '发文计划',
  status        VARCHAR(32)  NOT NULL DEFAULT '正常' COMMENT '账号状态',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_accounts_employee_id (employee_id),
  INDEX idx_accounts_platform    (platform),
  INDEX idx_accounts_status      (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运营账号表';

-- ============================================================
-- 4. posts
-- backend/src/entities/post.entity.ts + posts/rankings/imports services.
-- 迁移来源：M10（追加 cover_thumb_url 封面缩略图URL字段）、
--          M21（追加 idx_posts_platform_type_published）
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id                    VARCHAR(64)  PRIMARY KEY,
  employee_id           VARCHAR(64)  NOT NULL COMMENT '发布员工ID',
  account_id            VARCHAR(64)  NOT NULL COMMENT '所属账号ID',
  platform              VARCHAR(32)  NOT NULL COMMENT '平台',
  title                 VARCHAR(255) NOT NULL COMMENT '作品标题',
  copywriting           TEXT         NULL COMMENT '文案内容',
  cover_image_url       VARCHAR(500) NULL COMMENT '封面图URL',
  cover_thumb_url       VARCHAR(500) NULL COMMENT '封面缩略图URL',
  post_url              VARCHAR(500) NULL COMMENT '作品链接',
  post_type             VARCHAR(32)  NOT NULL COMMENT '作品类型',
  traffic               BIGINT       NOT NULL DEFAULT 0 COMMENT '浏览/播放量',
  likes                 BIGINT       NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments              BIGINT       NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites             BIGINT       NOT NULL DEFAULT 0 COMMENT '平台收藏数',
  shares                BIGINT       NOT NULL DEFAULT 0 COMMENT '分享数',
  metrics_updated_at    DATETIME     NULL COMMENT '指标更新时间',
  published_at          DATE         NOT NULL COMMENT '发布日期',
  note                  TEXT         NULL COMMENT '备注',
  supervisor_suggestion TEXT         NULL COMMENT '主管建议',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_posts_employee_id        (employee_id),
  INDEX idx_posts_account_id         (account_id),
  INDEX idx_posts_platform           (platform),
  INDEX idx_posts_post_type          (post_type),
  INDEX idx_posts_published_at       (published_at),
  INDEX idx_posts_employee_published (employee_id, published_at DESC, created_at DESC),
  INDEX idx_posts_account_published  (account_id, published_at DESC),
  INDEX idx_posts_platform_type_published (platform, post_type, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品帖子表';

-- ============================================================
-- 5. leads
-- backend/src/entities/lead.entity.ts + leads/exports/orders services.
-- v1.2 增量：M18 新增 deal_status 字段；M16 增量：requirement_note/supervisor_note（已就位）
-- 状态字段用 VARCHAR，避免旧中文值、迁移枚举值、前端过滤值互相卡死。
-- 当前 B 端状态机 code：
--   status: new / assigned / in_followup / in_collaboration /
--           operation_handled / added_success / deal_done / invalid
--   process_status: not_contacted / waiting_pass / communicating /
--                   quoted / deal_pending / deal_done / invalid
--   add_status: not_added / applied / not_passed / operation_reminded / added
-- 迁移来源：M1（6 列扩展 + process_status ENUM）→ M6（add_status/status ENUM）→ M9（VARCHAR 终态）、
--          M18（deal_status）、M21（列表筛选复合索引）
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                       VARCHAR(64)  PRIMARY KEY,
  employee_id              VARCHAR(64)  NOT NULL COMMENT '录入/来源运营员工ID',
  account_id               VARCHAR(64)  NOT NULL COMMENT '来源账号ID',
  post_id                  VARCHAR(64)  NULL COMMENT '来源作品ID',
  platform                 VARCHAR(32)  NOT NULL COMMENT '来源平台',
  contact_info             VARCHAR(255) NOT NULL COMMENT '联系方式',
  nickname                 VARCHAR(128) NULL COMMENT '客户昵称',
  budget                   VARCHAR(64)  NULL COMMENT '预算',
  major_content            VARCHAR(255) NULL COMMENT '专业/需求',
  ip                       VARCHAR(128) NULL COMMENT 'IP地址',
  status                   VARCHAR(32)  NOT NULL DEFAULT 'new' COMMENT '客资状态: new/assigned/in_followup/in_collaboration/operation_handled/added_success/deal_done/invalid',
  deal_amount              DECIMAL(12,2) NULL COMMENT '成交金额',
  note                     TEXT         NULL COMMENT '备注',
  requirement_note         TEXT         NULL COMMENT '需求备注（销售端展示）',
  supervisor_note          TEXT         NULL COMMENT '主管备注（销售端展示）',
  capture_image_url        VARCHAR(500) NULL COMMENT '引流截图URL',
  sales_feedback           TEXT         NULL COMMENT '销售反馈',
  sales_updated_at         DATETIME     NULL COMMENT '销售更新时间',
  sales_user_name          VARCHAR(64)  NULL COMMENT '销售用户名',
  assigned_sales_user_id   VARCHAR(64)  NULL COMMENT '分配销售用户ID',
  assigned_sales_user_name VARCHAR(64)  NULL COMMENT '分配销售名称',
  process_status           VARCHAR(32)  NOT NULL DEFAULT 'not_contacted' COMMENT '销售处理状态: not_contacted/waiting_pass/communicating/quoted/deal_pending/deal_done/invalid',
  deal_status              VARCHAR(32)  NOT NULL DEFAULT 'not_deal' COMMENT '成交状态: not_deal/deal_pending/deal_done/refunded/invalid（M18 新增）',
  add_status               VARCHAR(32)  NOT NULL DEFAULT 'not_added' COMMENT '添加状态: not_added/applied/not_passed/operation_reminded/added',
  intention                VARCHAR(32)  NULL COMMENT '意向',
  lead_code                VARCHAR(32)  NULL COMMENT '客资编号',
  intention_level          VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '意向度',
  add_method               VARCHAR(16)  NOT NULL DEFAULT 'unknown' COMMENT '添加方式',
  next_follow_time         DATETIME     NULL COMMENT '下次跟进时间',
  matched_post_id          VARCHAR(64)  NULL COMMENT '匹配作品ID',
  source_unknown           TINYINT      NOT NULL DEFAULT 0 COMMENT '来源未知',
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_leads_lead_code             (lead_code),
  INDEX idx_leads_employee_id                 (employee_id),
  INDEX idx_leads_account_id                  (account_id),
  INDEX idx_leads_post_id                     (post_id),
  INDEX idx_leads_platform                    (platform),
  INDEX idx_leads_status                      (status),
  INDEX idx_leads_process_status              (process_status),
  INDEX idx_leads_deal_status                 (deal_status),
  INDEX idx_leads_add_status                  (add_status),
  INDEX idx_leads_assigned_sales_user_id      (assigned_sales_user_id),
  INDEX idx_leads_intention_level             (intention_level),
  INDEX idx_leads_add_method                  (add_method),
  INDEX idx_leads_next_follow                 (next_follow_time, assigned_sales_user_id),
  INDEX idx_leads_matched_post_id             (matched_post_id),
  INDEX idx_leads_created_at                  (created_at),
  INDEX idx_leads_employee_created            (employee_id, created_at DESC),
  INDEX idx_leads_sales_process               (assigned_sales_user_id, process_status, created_at DESC),
  INDEX idx_leads_status_created              (status, created_at),
  INDEX idx_leads_add_status_created          (add_status, created_at),
  INDEX idx_leads_process_status_created      (process_status, created_at),
  INDEX idx_leads_platform_created            (platform, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资线索表';

-- ============================================================
-- 6. lead_follow_records
-- backend/src/entities/lead-follow-record.entity.ts
-- 迁移来源：M4（替换 ddl/03 留下的 BIGINT 旧表为 VARCHAR(64) UUID 风格）
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_follow_records (
  id               VARCHAR(64) PRIMARY KEY,
  lead_id          VARCHAR(64) NOT NULL COMMENT '所属客资ID',
  user_id          VARCHAR(64) NOT NULL COMMENT '跟进用户ID',
  follow_type      VARCHAR(32) NOT NULL DEFAULT '微信' COMMENT '跟进方式',
  content          TEXT        NULL COMMENT '跟进内容',
  next_follow_time DATETIME    NULL COMMENT '下次跟进时间',
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_follow_lead_id      (lead_id),
  INDEX idx_follow_user_id      (user_id),
  INDEX idx_follow_lead_created (lead_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资跟进记录表';

-- ============================================================
-- 6b. lead_files
-- 迁移来源：M4（替换 ddl/03 留下的 BIGINT 旧表，与全局 VARCHAR(64) UUID 风格对齐）
-- 业务现状：当前代码未引用此表，但线上库已建，按 M4 终态保留以备客资附件/截图使用
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_files (
  id          VARCHAR(64)  PRIMARY KEY,
  lead_id     VARCHAR(64)  NOT NULL                COMMENT '所属客资ID',
  file_url    VARCHAR(500) NOT NULL                COMMENT '文件URL',
  file_type   VARCHAR(32)  NOT NULL DEFAULT 'image' COMMENT '文件类型: image/screenshot/document',
  uploaded_by VARCHAR(64)  NOT NULL                COMMENT '上传人 users.id',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',

  INDEX idx_lead_files_lead     (lead_id),
  INDEX idx_lead_files_uploader (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客资附件/截图表';

-- ============================================================
-- 7. lead_drafts
-- backend/src/entities/lead-draft.entity.ts
-- 迁移来源：M3（按 schema.sql §7 字段建表，库内原本缺失）
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_drafts (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL COMMENT '用户ID',
  draft_type   VARCHAR(32) NOT NULL COMMENT '草稿类型',
  content_json TEXT        NOT NULL COMMENT '草稿内容JSON',
  image_urls   JSON        NULL COMMENT '关联图片URL数组',
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_drafts_user_id           (user_id),
  INDEX idx_drafts_user_type_updated (user_id, draft_type, updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='录入草稿表';

-- ============================================================
-- 8. collaboration_tasks
-- backend/src/entities/collaboration-task.entity.ts
-- 迁移来源：M3（替换早期 ddl/04 BIGINT 旧表为 VARCHAR(64) 风格）、
--          M15（status 枚举追加 'timeout'，配合 collabTimeoutScan 30min 扫描器）、
--          M16（追加 idx_collab_created_at）、
--          M21（追加 idx_collab_status_created）
-- ============================================================
CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id           VARCHAR(64) PRIMARY KEY,
  lead_id      VARCHAR(64) NOT NULL COMMENT '关联客资ID',
  requester_id VARCHAR(64) NOT NULL COMMENT '发起人用户ID',
  handler_id   VARCHAR(64) NULL COMMENT '处理人用户ID',
  type         ENUM('remind_customer','supplement_info','verify_identity','second_touch') NOT NULL COMMENT '协作类型',
  reason       TEXT        NULL COMMENT '协作原因',
  status       ENUM('pending','handling','handled','closed','timeout') NOT NULL DEFAULT 'pending' COMMENT '协作状态(含超时态 timeout;由 M15 迁移追加,配合 collabTimeoutScan 30min 扫描器使用)',
  handled_note TEXT        NULL COMMENT '处理备注',
  requested_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at   DATETIME    NULL COMMENT '处理完成时间',
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_collab_lead        (lead_id),
  INDEX idx_collab_requester   (requester_id),
  INDEX idx_collab_handler     (handler_id),
  INDEX idx_collab_status      (status),
  INDEX idx_collab_created_at  (created_at),
  INDEX idx_collab_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='协同任务表';

-- ============================================================
-- 9. orders
-- backend/src/entities/order.entity.ts
-- 迁移来源：M3（替换早期 ddl/04 BIGINT 旧表为 VARCHAR(64) 风格）、
--          M14（追加 handover_status 交接状态字段）、
--          M16（追加 idx_orders_paid_status）、
--          M19（状态列统一为 VARCHAR）、M21（状态列表复合索引）
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                VARCHAR(64) PRIMARY KEY,
  lead_id           VARCHAR(64) NOT NULL COMMENT '关联客资ID',
  sales_user_id     VARCHAR(64) NOT NULL COMMENT '销售用户ID',
  academic_user_id  VARCHAR(64) NULL COMMENT '教务用户ID',
  service_type      VARCHAR(64) NULL COMMENT '服务类型',
  amount            DECIMAL(12,2) NULL COMMENT '成交金额',
  paid_status       VARCHAR(32) NOT NULL DEFAULT 'unpaid' COMMENT '付款状态：unpaid/partial/paid/refunded',
  order_status      VARCHAR(32) NOT NULL DEFAULT 'to_receive' COMMENT '订单状态：pending_accept/to_receive/in_progress/awaiting_client_info/awaiting_teacher/to_deliver/completed/abnormal/closed',
  handover_status   VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '交接状态: pending待交接 | handed_over已交接 | accepted已接收 | rejected已拒收(由 M14 迁移追加;销售成交时默认 handed_over,教务可 accept/reject)',
  remark            TEXT        NULL COMMENT '备注',
  created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_orders_lead_id          (lead_id),
  INDEX idx_orders_sales_user_id    (sales_user_id),
  INDEX idx_orders_academic_user_id (academic_user_id),
  INDEX idx_orders_order_status     (order_status),
  INDEX idx_orders_paid_status      (paid_status),
  INDEX idx_orders_handover_status  (handover_status),
  INDEX idx_orders_created_at       (created_at),
  INDEX idx_orders_order_status_created (order_status, created_at),
  INDEX idx_orders_paid_status_created  (paid_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- ============================================================
-- 10. order_follow_records
-- backend/src/entities/order-follow-record.entity.ts
-- 迁移来源：M3（替换早期 ddl/04 BIGINT 旧表为 VARCHAR(64) 风格）、
--          M11（追加 reminder_sent_at 节点提醒幂等字段）、
--          M16（追加 idx_order_follow_created_at）、
--          M21（追加 idx_order_follow_remind_due）、
--          M22（追加 attachment_url / attachment_name 上传交付附件字段）
-- ============================================================
CREATE TABLE IF NOT EXISTS order_follow_records (
  id             VARCHAR(64) PRIMARY KEY,
  order_id       VARCHAR(64) NOT NULL COMMENT '关联订单ID',
  user_id        VARCHAR(64) NOT NULL COMMENT '跟进用户ID',
  node_type      VARCHAR(32) NOT NULL COMMENT '节点类型',
  content        TEXT        NULL COMMENT '跟进内容',
  next_remind_at DATETIME    NULL COMMENT '下次提醒时间',
  reminder_sent_at DATETIME  NULL COMMENT '节点提醒已发送时间(NULL=未发送)',
  attachment_url   VARCHAR(512) NULL COMMENT '附件 URL（M22 新增）',
  attachment_name  VARCHAR(255) NULL COMMENT '附件原始文件名（M22 新增）',
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_order_follow_order_id     (order_id),
  INDEX idx_order_follow_user_id      (user_id),
  INDEX idx_order_follow_remind       (next_remind_at, reminder_sent_at),
  INDEX idx_order_follow_created_at   (created_at),
  INDEX idx_order_follow_remind_due   (next_remind_at, reminder_sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单跟进记录表';

-- ============================================================
-- 11. notifications
-- backend/src/entities/notification.entity.ts
-- 迁移来源：M3（替换早期 ddl/05 BIGINT 旧表为 VARCHAR(64) 风格）
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id           VARCHAR(64)  PRIMARY KEY,
  receiver_id  VARCHAR(64)  NOT NULL COMMENT '接收者用户ID',
  sender_id    VARCHAR(64)  NULL COMMENT '发送者用户ID',
  port_type    VARCHAR(32)  NOT NULL COMMENT '端口类型',
  type_code    VARCHAR(64)  NOT NULL COMMENT '通知类型',
  title        VARCHAR(255) NOT NULL COMMENT '标题',
  content      TEXT         NULL COMMENT '内容',
  related_id   VARCHAR(64)  NULL COMMENT '关联业务ID',
  related_type VARCHAR(32)  NULL COMMENT '关联业务类型',
  read_status  TINYINT      NOT NULL DEFAULT 0 COMMENT '0未读 1已读',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_notify_receiver_read_created (receiver_id, read_status, created_at DESC),
  INDEX idx_notify_related               (related_type, related_id),
  INDEX idx_notify_type                  (type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统通知表';

-- ============================================================
-- 12. import_tasks
-- backend/src/entities/import-task.entity.ts + imports service.
-- 迁移来源：M3（按方案 §8.1 补全字段建表）、
--          M8（idempotent 兜底补 created_at/finished_at/error_file_url/status 兼容列）、
--          M23（追加 payload_json / result_json / error_message / updated_at 异步队列 4 列）
-- ============================================================
CREATE TABLE IF NOT EXISTS import_tasks (
  id             VARCHAR(64)  PRIMARY KEY,
  import_type    VARCHAR(32)  NOT NULL COMMENT '导入类型: leads/posts',
  user_id        VARCHAR(64)  NOT NULL COMMENT '发起人用户ID',
  total_count    INT          NOT NULL DEFAULT 0 COMMENT '总行数',
  success_count  INT          NOT NULL DEFAULT 0 COMMENT '成功数',
  fail_count     INT          NOT NULL DEFAULT 0 COMMENT '失败数',
  status         VARCHAR(32)  NOT NULL DEFAULT 'processing' COMMENT 'processing/done/failed',
  payload_json   JSON         NULL COMMENT '上传文件URL或粘贴原始数据（M23 新增，异步队列模式用）',
  result_json    JSON         NULL COMMENT '成功/失败明细（M23 新增）',
  error_message  TEXT         NULL COMMENT '最终错误信息（M23 新增）',
  error_file_url VARCHAR(500) NULL COMMENT '错误文件URL',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（M23 新增，TypeORM @UpdateDateColumn 必需）',
  finished_at    DATETIME     NULL COMMENT '完成时间',

  INDEX idx_import_user_id (user_id),
  INDEX idx_import_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导入任务表';

-- ============================================================
-- 13. operation_logs
-- backend/src/entities/operation-log.entity.ts
-- 迁移来源：M7（BIGINT 自增主键 → VARCHAR(64) UUID 主键）
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_logs (
  id          VARCHAR(64) PRIMARY KEY,
  user_id     VARCHAR(64) NOT NULL COMMENT '操作用户ID',
  action      VARCHAR(64) NOT NULL COMMENT '操作动作：login/logout/create/update/delete/disable/assign/reassign/status_change/export_create/export_download/view_sensitive/handover/abnormal_create/abnormal_close',
  target_type VARCHAR(32) NOT NULL COMMENT '目标类型',
  target_id   VARCHAR(64) NOT NULL COMMENT '目标ID',
  detail      TEXT        NULL COMMENT '详情',
  ip          VARCHAR(45) NULL COMMENT '客户端IP',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_oplog_user    (user_id),
  INDEX idx_oplog_target  (target_type, target_id),
  INDEX idx_oplog_action  (action),
  INDEX idx_oplog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- ============================================================
-- 14. exports
-- backend/src/entities/export-task.entity.ts
-- 迁移来源：M3（替换早期 ddl/04 BIGINT 旧表为 VARCHAR(64) 风格）
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
  id          VARCHAR(64)  PRIMARY KEY,
  user_id     VARCHAR(64)  NOT NULL COMMENT '发起用户ID',
  export_type VARCHAR(32)  NOT NULL COMMENT '导出类型',
  filter_json TEXT         NULL COMMENT '筛选条件JSON',
  file_url    VARCHAR(500) NULL COMMENT '生成文件URL',
  status      VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT 'pending/processing/completed/failed',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME     NULL COMMENT '完成时间',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_exports_user       (user_id),
  INDEX idx_exports_status     (status),
  INDEX idx_exports_created_at (created_at),
  INDEX idx_exports_user_created (user_id, created_at) COMMENT '导出中心列表 WHERE user_id=? ORDER BY created_at DESC',
  INDEX idx_exports_user_type_created (user_id, export_type, created_at) COMMENT 'E-P1-03 1分钟防抖查询+导出类型筛选'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导出任务表';

-- ============================================================
-- 15. favorites
-- backend/src/entities/favorite.entity.ts + favorites/posts/rankings services.
-- 迁移来源：M3（按 schema.sql 字段建表，库内原本缺失）、
--          M8（idempotent 兜底补 created_at 兼容列）
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  id          VARCHAR(64) PRIMARY KEY,
  user_id     VARCHAR(64) NOT NULL COMMENT '用户ID',
  target_type VARCHAR(32) NOT NULL COMMENT '目标类型: post/account',
  target_id   VARCHAR(64) NOT NULL COMMENT '目标ID',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE INDEX idx_fav_user_target (user_id, target_type, target_id),
  INDEX idx_fav_user_id            (user_id),
  INDEX idx_fav_target             (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收藏表';

-- ============================================================
-- 16. post_metrics_history
-- backend/src/entities/post-metrics-history.entity.ts
-- 迁移来源：M3（按 schema.sql 字段建表，库内原本缺失）、
--          M8（idempotent 兜底 IF NOT EXISTS 重建）
-- ============================================================
CREATE TABLE IF NOT EXISTS post_metrics_history (
  id          VARCHAR(64) PRIMARY KEY,
  post_id     VARCHAR(64) NOT NULL COMMENT '作品ID',
  likes       BIGINT      NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments    BIGINT      NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites   BIGINT      NOT NULL DEFAULT 0 COMMENT '收藏数',
  shares      BIGINT      NOT NULL DEFAULT 0 COMMENT '分享数',
  leads_count BIGINT      NOT NULL DEFAULT 0 COMMENT '获客数',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_history_post_id    (post_id),
  INDEX idx_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品指标刷新历史表';

-- ============================================================
-- 16a. post_metrics
-- backend/src/entities/post-metrics.entity.ts + migrations/M17
-- 表来源：migrations/M17__post_metrics_table.up.sql
-- 用途：作品指标按天聚合（学习榜单 / 流量榜 / 近期爆款基表）
-- 采集任务按天 upsert；idx_metrics_post_collected(post_id, date) UNIQUE 防止重复
-- ============================================================
CREATE TABLE IF NOT EXISTS post_metrics (
  id         VARCHAR(64)  NOT NULL                  COMMENT '主键（UUID）',
  post_id    VARCHAR(64)  NOT NULL                  COMMENT '关联 posts.id',
  date       DATE         NOT NULL                  COMMENT '指标收集日期（按天聚合）',
  likes      BIGINT       NOT NULL DEFAULT 0         COMMENT '点赞数',
  comments   BIGINT       NOT NULL DEFAULT 0         COMMENT '评论数',
  favorites  BIGINT       NOT NULL DEFAULT 0         COMMENT '收藏数',
  shares     BIGINT       NOT NULL DEFAULT 0         COMMENT '分享数',
  traffic    BIGINT       NOT NULL DEFAULT 0         COMMENT '来源流量（仅获客贴/营销贴）',
  views      BIGINT       NOT NULL DEFAULT 0         COMMENT '浏览数（可选）',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

  PRIMARY KEY (id),
  UNIQUE KEY idx_metrics_post_collected (post_id, date),
  KEY idx_metrics_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='作品指标按天聚合表（学习榜单/流量榜/近期爆款基表）';

-- ============================================================
-- 17. order_abnormal_feedbacks
-- backend/src/modules/orders/order-abnormal-feedback.service.ts + M13 迁移
-- 订单异常反馈独立表（替换原"节点类型含异常"的字符串匹配判定）
-- 状态机：open / handling / closed；驱动 orders.orderStatus='abnormal'；
-- 关闭后回退到 in_progress / to_receive。
-- 迁移来源：M13（建表）、M16（追加 idx_oaf_created_at）
-- ============================================================
CREATE TABLE IF NOT EXISTS order_abnormal_feedbacks (
  id                VARCHAR(64)  NOT NULL COMMENT '异常反馈主键ID（UUID）',
  order_id          VARCHAR(64)  NOT NULL COMMENT '关联订单ID（orders.id）',
  lead_id           VARCHAR(64)  NULL     COMMENT '关联客资ID（leads.id，冗余便于查询客资维度）',
  reporter_user_id  VARCHAR(64)  NOT NULL COMMENT '反馈提交人ID（users.id，一般是教务）',
  abnormal_type     VARCHAR(32)  NOT NULL COMMENT '异常类型：client_uncooperative 客户不配合 | material_missing 素材缺失 | teacher_no_response 老师未响应 | cycle_risk 周期风险 | payment_issue 款项问题 | other 其他',
  description       TEXT         NULL     COMMENT '异常描述',
  expected_helper   VARCHAR(32)  NULL     COMMENT '期望协助方：sales 销售 | supervisor 主管 | operation 运营 | other 其他',
  status            VARCHAR(16)  NOT NULL DEFAULT 'open' COMMENT '状态：open 待处理 | handling 处理中 | closed 已关闭',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  closed_at         DATETIME     NULL     COMMENT '关闭时间',
  closed_by         VARCHAR(64)  NULL     COMMENT '关闭操作人ID（users.id）',
  close_note        TEXT         NULL     COMMENT '关闭备注/解决方案',

  PRIMARY KEY (id),
  KEY idx_oaf_order_id    (order_id),
  KEY idx_oaf_status      (status),
  KEY idx_oaf_reporter    (reporter_user_id),
  KEY idx_oaf_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='订单异常反馈表：教务端可独立提交，状态机驱动 orders.orderStatus=abnormal，关闭后回退到进行中';
