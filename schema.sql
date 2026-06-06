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
  department     VARCHAR(64) NULL COMMENT '部门名称（v1.4 简单字符串存储，不另建部门表）',
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
--          M21（追加 idx_posts_platform_type_published）、
--          M27（SUP-1：is_supervisor_picked 主管手动标记优秀作品 + 标记人/时间字段）
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
  post_type             VARCHAR(32)  NOT NULL COMMENT '作品类型（获客贴/话题贴/素人贴；历史值：图文=note/视频=video/获客贴=lead_post/营销贴/讨论帖/人设贴）',
  traffic               BIGINT       NOT NULL DEFAULT 0 COMMENT '浏览/播放量',
  likes                 BIGINT       NOT NULL DEFAULT 0 COMMENT '点赞数',
  comments              BIGINT       NOT NULL DEFAULT 0 COMMENT '评论数',
  favorites             BIGINT       NOT NULL DEFAULT 0 COMMENT '平台收藏数',
  shares                BIGINT       NOT NULL DEFAULT 0 COMMENT '分享数',
  metrics_updated_at    DATETIME     NULL COMMENT '指标更新时间',
  published_at          DATE         NOT NULL COMMENT '发布日期',
  note                  TEXT         NULL COMMENT '备注',
  supervisor_suggestion TEXT         NULL COMMENT '主管建议',
  -- v1.3 增量（SUP-1）：主管手动标记优秀作品（学习榜单主管推荐栏目使用）
  is_supervisor_picked  TINYINT      NOT NULL DEFAULT 0 COMMENT '是否被主管标记为优秀作品（学习榜单主管推荐用）',
  supervisor_picked_by  VARCHAR(64)  NULL COMMENT '标记人（主管）ID',
  supervisor_picked_at  DATETIME     NULL COMMENT '标记时间',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_posts_employee_id        (employee_id),
  INDEX idx_posts_account_id         (account_id),
  INDEX idx_posts_platform           (platform),
  INDEX idx_posts_post_type          (post_type),
  INDEX idx_posts_published_at       (published_at),
  INDEX idx_posts_employee_published (employee_id, published_at DESC, created_at DESC),
  INDEX idx_posts_account_published  (account_id, published_at DESC),
  INDEX idx_posts_platform_type_published (platform, post_type, published_at),
  INDEX idx_posts_supervisor_picked  (is_supervisor_picked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作品帖子表';

-- ============================================================
-- 5. leads
-- backend/src/entities/lead.entity.ts + leads/exports/orders services.
-- v1.2 增量：M18 新增 deal_status 字段；M16 增量：requirement_note/supervisor_note（已就位）
-- v1.3 增量：M26 新增 is_dispatched 分流字段 + 销售跟进 6 字段（CROSS-1 / CROSS-2）
-- 状态字段用 VARCHAR，避免旧中文值、迁移枚举值、前端过滤值互相卡死。
-- 当前 B 端状态机 code：
--   status: new / assigned / in_followup / in_collaboration /
--           operation_handled / added_success / deal_done / invalid
--   process_status: not_contacted / waiting_pass / communicating /
--                   quoted / deal_pending / deal_done / invalid
--   add_status: not_added / applied / not_passed / operation_reminded / added
-- 迁移来源：M1（6 列扩展 + process_status ENUM）→ M6（add_status/status ENUM）→ M9（VARCHAR 终态）、
--          M18（deal_status）、M21（列表筛选复合索引）、
--          M26（is_dispatched + 销售跟进 6 字段）
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
  -- v1.3 增量（M26 / CROSS-1 客资分流）
  is_dispatched            TINYINT      NOT NULL DEFAULT 0 COMMENT '客资分流：0未分流(进销售看板) / 1已分流(不进销售看板)',
  -- v1.3 增量（M26 / CROSS-2 销售跟进字段扩展；客户需求走 requirement_note，意向走 intention_level，不重复）
  client_degree            VARCHAR(32)  NULL COMMENT '客户学历',
  client_major_research    VARCHAR(255) NULL COMMENT '客户专业/研究方向',
  client_time_requirement  VARCHAR(255) NULL COMMENT '时间要求',
  objection_point          TEXT         NULL COMMENT '异议点',
  follow_action            TEXT         NULL COMMENT '具体跟进措施',
  follow_action_at         DATETIME     NULL COMMENT '具体跟进时间',
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
  INDEX idx_leads_platform_created            (platform, created_at),
  INDEX idx_leads_is_dispatched               (is_dispatched),
  INDEX idx_leads_follow_action_at            (follow_action_at)
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
--          M19（状态列统一为 VARCHAR）、M21（状态列表复合索引）、
--          M26（order_code 订单编号 + orders_order_code_seq 序列表）、
--          M28（SA-8/AC-1：product_type 产品类型 / guarantee_type 保障类型 / payment_stage 付款阶段）
-- 教务端字段扩展：见 17.4 节
--   - 客户/作者/投稿相关：education_level / major / area / article_purpose /
--     submit_email / submit_email_password / fund_info / registration_status /
--     handover_to_teacher_at / checked_duplicate
--   - 派单/审核/进度：dispatched_teacher_id / teacher_id / teacher_phone /
--     teacher_stability / innovation_review_status / innovation_review_at /
--     draft_review_status / draft_review_at / editor_review_status /
--     editor_review_at / author_verify_status / author_verify_at / paper_progress
--   - 阶段/查稿/状态：current_stage / first_week_check_at / next_check_at /
--     urge_letter_status / revision_status / page_fee_status / proof_status /
--     online_status / indexed_status / index_review_report / risk_level
--   - 订单编号：order_code（v1.3 / CROSS-4，按 ORD-YYYYMMDD-XXXXX 规则生成）
--   详细字段映射至 order_authors / order_submissions / order_status_history /
--   order_reminders / order_finance / teachers 子表与扩展字段。
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                       VARCHAR(64)  PRIMARY KEY,
  lead_id                  VARCHAR(64)  NOT NULL COMMENT '关联客资ID',
  sales_user_id            VARCHAR(64)  NOT NULL COMMENT '销售用户ID',
  academic_user_id         VARCHAR(64)  NULL COMMENT '教务用户ID',
  service_type             VARCHAR(64)  NULL COMMENT '服务类型',
  -- v1.3 增量（M28 / SA-8 成交录入 + AC-1 教务端我的成交）
  product_type             VARCHAR(32)  NULL COMMENT '产品类型：专利/期刊论文/硕士毕业论文/博士毕业论文/基金/EI会议/普刊/国际会议',
  guarantee_type           VARCHAR(16)  NULL COMMENT '保障类型：保录/保盲审/不保',
  payment_stage            VARCHAR(64)  NULL COMMENT '付款阶段：定金/中期/尾款 等自由文本',
  amount                   DECIMAL(12,2) NULL COMMENT '成交金额',
  paid_status              VARCHAR(32) NOT NULL DEFAULT 'unpaid' COMMENT '付款状态：unpaid/partial/paid/refunded',
  order_status             VARCHAR(32) NOT NULL DEFAULT 'to_receive' COMMENT '订单状态：pending_accept/to_receive/in_progress/awaiting_client_info/awaiting_teacher/to_deliver/completed/abnormal/closed',
  handover_status          VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '交接状态: pending待交接 | handed_over已交接 | accepted已接收 | rejected已拒收(由 M14 迁移追加;销售成交时默认 handed_over,教务可 accept/reject)',
  remark                   TEXT        NULL COMMENT '备注',
  -- v1.3 增量（M26 / CROSS-4 订单编号，ORD-YYYYMMDD-XXXXX；历史数据 NULL）
  order_code               VARCHAR(32) NULL COMMENT '订单编号（ORD-YYYYMMDD-XXXXX；唯一）',
  -- 客户基础信息扩展（教务端录入）
  education_level          VARCHAR(32)  NULL COMMENT '学历层级：本科/硕士/博士/其他',
  major                    VARCHAR(128) NULL COMMENT '专业方向',
  area                     VARCHAR(128) NULL COMMENT '所需区位',
  article_purpose          VARCHAR(128) NULL COMMENT '文章用途',
  -- 作者/投稿邮箱/基金/登记表相关
  submit_email             VARCHAR(128) NULL COMMENT '投稿邮箱',
  submit_email_password    VARCHAR(128) NULL COMMENT '投稿邮箱密码',
  fund_info                TEXT         NULL COMMENT '基金信息',
  registration_status      VARCHAR(32)  NOT NULL DEFAULT 'pending' COMMENT '个人信息登记表状态：pending待收齐/partial部分收齐/collected已收齐',
  handover_to_teacher_at   DATETIME     NULL COMMENT '传递给老师时间',
  checked_duplicate        TINYINT      NOT NULL DEFAULT 0 COMMENT '是否查重：0否 1是',
  -- 派单/接单/审核/进度
  dispatched_teacher_id    VARCHAR(64)  NULL COMMENT '派单老师ID（teachers.id）',
  teacher_id               VARCHAR(64)  NULL COMMENT '接单老师ID（teachers.id）',
  teacher_phone            VARCHAR(64)  NULL COMMENT '老师电话',
  teacher_stability        VARCHAR(16)  NULL COMMENT '老师稳定性：stable稳定/new新老师/probation试合作',
  innovation_review_status VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '新老师创新点审核：pending待审核/passed通过/rejected驳回/skipped跳过(稳定老师)',
  innovation_review_at     DATETIME     NULL COMMENT '创新点审核时间',
  draft_review_status      VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '初稿审核：pending待审核/passed通过/rejected驳回',
  draft_review_at          DATETIME     NULL COMMENT '初稿审核时间',
  editor_review_status     VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '编辑老师审查：pending待审查/passed通过/rejected驳回',
  editor_review_at         DATETIME     NULL COMMENT '编辑审查时间',
  author_verify_status     VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '投稿前作者信息核对：pending待核对/passed通过/rejected驳回',
  author_verify_at         DATETIME     NULL COMMENT '作者信息核对时间',
  paper_progress           VARCHAR(32)  NULL COMMENT '论文进度（运营/教务维护的业务进度，与 order_status 区分）',
  -- 阶段/查稿/状态
  current_stage            VARCHAR(32)  NULL COMMENT '当前真实阶段：Submitted/WithEditor/UnderReview/Revision/Accepted/Proofing/Online/Indexed/Rejected',
  first_week_check_at      DATETIME     NULL COMMENT '首周查稿时间',
  next_check_at            DATETIME     NULL COMMENT '下次查稿时间',
  urge_letter_status       VARCHAR(16)  NOT NULL DEFAULT 'not_sent' COMMENT '催稿信状态：not_sent未发/sent已发/replied已回复',
  revision_status          VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '返修状态：none无/required需返修/in_progress返修中/completed已完成',
  page_fee_status          VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '版面费状态：none无/required待付/paid已付',
  proof_status             VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '校稿状态：none无/in_progress进行中/completed已完成',
  online_status            VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT 'Online 状态：none无/in_progress进行中/published已上线',
  indexed_status           VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '检索状态：none无/in_progress检索中/indexed已检索/failed检索失败',
  index_review_report      VARCHAR(500) NULL COMMENT '检索审查报告附件URL',
  risk_level               VARCHAR(16)  NOT NULL DEFAULT 'low' COMMENT '风险等级：low低/mid中/high高',
  -- 订单阶段/下次跟进时间
  order_stage              VARCHAR(64)  NULL COMMENT '订单阶段（业务侧对当前所处交付环节的描述）',
  next_follow_at           DATETIME     NULL COMMENT '下次跟进时间',
  created_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_orders_lead_id                (lead_id),
  INDEX idx_orders_sales_user_id          (sales_user_id),
  INDEX idx_orders_academic_user_id       (academic_user_id),
  INDEX idx_orders_teacher_id             (teacher_id),
  INDEX idx_orders_dispatched_teacher_id  (dispatched_teacher_id),
  INDEX idx_orders_order_status           (order_status),
  INDEX idx_orders_paid_status            (paid_status),
  INDEX idx_orders_handover_status        (handover_status),
  INDEX idx_orders_current_stage          (current_stage),
  INDEX idx_orders_paper_progress         (paper_progress),
  INDEX idx_orders_risk_level             (risk_level),
  INDEX idx_orders_next_check_at          (next_check_at),
  INDEX idx_orders_next_follow_at         (next_follow_at),
  INDEX idx_orders_created_at             (created_at),
  INDEX idx_orders_order_status_created   (order_status, created_at),
  INDEX idx_orders_paid_status_created    (paid_status, created_at),
  -- v1.3 增量（M26 / CROSS-4）：订单号唯一索引
  UNIQUE INDEX uk_orders_order_code        (order_code),
  -- v1.3 增量（M28）：产品类型 / 保障类型筛选索引
  INDEX idx_orders_product_type            (product_type),
  INDEX idx_orders_guarantee_type          (guarantee_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表（v1.3 增量：M26 订单编号 + M28 产品/保障/付款阶段 业务字段；教务端字段扩展：客户基础/作者邮箱/老师派单/审核/阶段/查稿/风险）';

-- ============================================================
-- 9b. orders_order_code_seq（v1.3 / CROSS-4 订单号序列表）
-- backend 端：orders.service.ts#generateOrderCode
--   - 按日单行（uk_orders_order_code_seq_date 唯一）
--   - SELECT ... FOR UPDATE 行锁保证并发安全
--   - 业务统一用 UTC+8 作为日期分界，避免跨时区部署日期错位
-- ============================================================
CREATE TABLE IF NOT EXISTS orders_order_code_seq (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  seq_date    DATE         NOT NULL COMMENT '序号日期（YYYY-MM-DD，按 UTC+8 分界）',
  current_seq INT          NOT NULL DEFAULT 0 COMMENT '当日已用最大序号（0 = 尚未使用）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_orders_order_code_seq_date (seq_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单号序列表（按日自增）';

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
  traffic    BIGINT       NOT NULL DEFAULT 0         COMMENT '来源流量（仅获客贴；历史口径同义：营销贴）',
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

-- ============================================================
-- 18. supervisor_suggestions
-- backend/src/entities/supervisor-suggestion.entity.ts + backend/migrations/add-supervisor-suggestions-table.sql
-- 主管建议表：存储主管给运营的建议，支持关联账号、作品、员工
-- 功能流程：创建建议 -> 通知对应运营 -> 已读状态
-- target_type: post(account作品) / account(账号) / employee(员工)
-- 迁移来源：add-supervisor-suggestions-table.sql（建表）
-- ============================================================
CREATE TABLE IF NOT EXISTS supervisor_suggestions (
  id            VARCHAR(64)  PRIMARY KEY,
  sender_id     VARCHAR(64)  NOT NULL COMMENT '发送者（主管）用户ID',
  receiver_id   VARCHAR(64)  NOT NULL COMMENT '接收者（运营）用户ID',
  employee_id   VARCHAR(64)  NULL COMMENT '关联员工ID（方便查询该员工的所有建议）',
  target_type   VARCHAR(32)  NOT NULL COMMENT '建议对象类型：post/account/employee',
  target_id     VARCHAR(64)  NOT NULL COMMENT '建议对象ID',
  content       TEXT         NOT NULL COMMENT '建议内容',
  read_status   TINYINT      NOT NULL DEFAULT 0 COMMENT '已读状态：0未读 1已读',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ss_employee_id (employee_id),
  INDEX idx_ss_target      (target_type, target_id),
  INDEX idx_ss_receiver    (receiver_id, read_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管建议表：存储主管给运营的建议（关联账号/作品/员工）';

-- ============================================================
-- 19. revoked_tokens
-- backend/src/modules/auth/entities/revoked-token.entity.ts
-- 撤销 token 表：登出 / admin 强制下线时写入；AuthGuard 在 JWT 验证通过后再校验此表
-- 修复 P0 回归 PF-05：原 auth.service.logout() 只清 in-memory Map，
--   JWT 仍可在 24h 过期前通过 verify，2026-06-04 修复。
-- token_hash = SHA256(token) 存索引（不存原 token）
-- expires_at = 原 token 过期时间（后台定时清理过期记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id          VARCHAR(64)  PRIMARY KEY,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE COMMENT 'SHA256(token) 哈希（不存原 token）',
  user_id     VARCHAR(64)  NOT NULL COMMENT '所属用户ID',
  revoked_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '撤销时间',
  expires_at  DATETIME     NULL COMMENT '原 token 过期时间（定时清理用）',
  reason      VARCHAR(32)  NOT NULL DEFAULT 'logout' COMMENT 'logout / admin_revoke / password_change / session_replaced 等',

  INDEX idx_revoked_tokens_token   (token_hash),
  INDEX idx_revoked_tokens_user    (user_id),
  INDEX idx_revoked_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='已撤销的 JWT token（PF-05 修复）';

-- ============================================================
-- 19. teachers（教务端 v1.3 业务参考新增：稳定老师库）
-- 业务来源：完整项目源码包 v1 原型「稳定老师库」页面
-- 业务字段：老师姓名、电话/微信、专业能力、接单方向、稳定性、质量评分、备注
-- 自动统计：接单状态（空闲/接单中/满载）、当前接单数、累计接单数
-- 关系：与 orders.teacher_id / orders.dispatched_teacher_id 关联
-- 与 v1 原型兼容：v1 原型 localStorage 数据不导入，新版本独立建表
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
  id              VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(64)  NOT NULL COMMENT '老师姓名',
  phone           VARCHAR(64)  NULL COMMENT '电话',
  wechat          VARCHAR(64)  NULL COMMENT '微信',
  specialty       VARCHAR(255) NULL COMMENT '专业能力',
  direction       VARCHAR(255) NULL COMMENT '接单方向',
  stability       VARCHAR(16)  NOT NULL DEFAULT 'new' COMMENT '稳定性：stable稳定/new新老师/probation试合作',
  quality_score   DECIMAL(3,1) NULL COMMENT '质量评分(0-10)',
  remark          TEXT         NULL COMMENT '备注',
  status          VARCHAR(16)  NOT NULL DEFAULT 'idle' COMMENT '接单状态：idle空闲/working接单中/full满载',
  current_orders  INT          NOT NULL DEFAULT 0 COMMENT '当前接单数（实时统计缓存）',
  total_orders    INT          NOT NULL DEFAULT 0 COMMENT '累计接单数（实时统计缓存）',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_teachers_status    (status),
  INDEX idx_teachers_stability (stability),
  INDEX idx_teachers_name      (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='稳定老师库：教务端老师档案与派单关系';

-- ============================================================
-- 20. order_authors（教务端：订单多作者信息）
-- 业务来源：v1 原型订单录入「作者信息」板块
-- 业务规则：每位订单支持 1..N 位作者，author_order 表示作者位次
--   1 = 第一作者 / 2 = 第二作者 / N = 第 N 作者
-- 字段对应 v1：作者姓名/邮箱/学历/学校/邮编/英文作者信息
-- ============================================================
CREATE TABLE IF NOT EXISTS order_authors (
  id           VARCHAR(64)  PRIMARY KEY,
  order_id     VARCHAR(64)  NOT NULL COMMENT '所属订单ID（orders.id）',
  author_order INT          NOT NULL DEFAULT 1 COMMENT '作者位次：1=第一作者, 2=第二作者, ...',
  name         VARCHAR(64)  NOT NULL COMMENT '作者姓名',
  email        VARCHAR(128) NULL COMMENT '作者邮箱',
  degree       VARCHAR(32)  NULL COMMENT '作者学历',
  school       VARCHAR(128) NULL COMMENT '作者学校',
  zip_code     VARCHAR(16)  NULL COMMENT '邮编',
  name_en      VARCHAR(255) NULL COMMENT '英文作者信息',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_order_authors_order_seq (order_id, author_order),
  INDEX idx_order_authors_order           (order_id),
  INDEX idx_order_authors_email           (email),
  INDEX idx_order_authors_school          (school)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单多作者信息表';

-- ============================================================
-- 21. order_submissions（教务端：1-3 组投稿信息）
-- 业务来源：v1 原型订单录入「投稿信息」板块
-- 业务规则：操作方式决定投稿组数
--   一稿一投 → submission_no=1
--   两稿两投 → submission_no=1,2
--   三稿三投 → submission_no=1,2,3
-- 字段对应 v1：论文名称/投稿期刊/投稿网址/投稿账号/投稿密码/投稿时间
-- ============================================================
CREATE TABLE IF NOT EXISTS order_submissions (
  id            VARCHAR(64)  PRIMARY KEY,
  order_id      VARCHAR(64)  NOT NULL COMMENT '所属订单ID（orders.id）',
  submission_no INT          NOT NULL DEFAULT 1 COMMENT '投稿序号：1/2/3，对应一稿一投/两稿两投/三稿三投',
  paper_title   VARCHAR(255) NOT NULL COMMENT '论文名称',
  journal_name  VARCHAR(255) NULL COMMENT '投稿期刊',
  journal_url   VARCHAR(500) NULL COMMENT '投稿网址',
  account       VARCHAR(128) NULL COMMENT '投稿账号',
  password      VARCHAR(128) NULL COMMENT '投稿密码',
  submit_time   DATETIME     NULL COMMENT '投稿时间',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_order_submissions_order_no (order_id, submission_no),
  INDEX idx_order_submissions_order         (order_id),
  INDEX idx_order_submissions_submit_time   (submit_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单投稿信息表（一稿一投/两稿两投/三稿三投）';

-- ============================================================
-- 22. order_status_history（教务端：9 阶段状态机轨迹）
-- 业务来源：v1 原型订单录入「状态信息」板块 + doc/运营中台四端口 十七.4
- 9 个阶段：Submitted / WithEditor / UnderReview / Revision / Accepted / Proofing / Online / Indexed / Rejected
-- 业务规则：
--   - 每次进入新阶段写一行 entered_at=left_at=NULL 表示进行中
--   - 离开阶段时回填 left_at
--   - 触发提醒/规则时按 stage 维度查表
-- 与 order_node_remind_log 关系：提醒幂等按规则；本表按阶段轨迹全量留存
-- ============================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id           VARCHAR(64)  PRIMARY KEY,
  order_id     VARCHAR(64)  NOT NULL COMMENT '所属订单ID（orders.id）',
  stage        VARCHAR(32)  NOT NULL COMMENT '阶段：Submitted/WithEditor/UnderReview/Revision/Accepted/Proofing/Online/Indexed/Rejected',
  entered_at   DATETIME     NOT NULL COMMENT '进入该阶段时间',
  left_at      DATETIME     NULL COMMENT '离开该阶段时间（NULL=当前阶段）',
  expected_at  DATETIME     NULL COMMENT '该阶段预计产出时间（用于超时提醒）',
  operator_id  VARCHAR(64)  NULL COMMENT '操作人（教务）ID（users.id）',
  note         TEXT         NULL COMMENT '备注',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_osh_order              (order_id),
  INDEX idx_osh_order_entered      (order_id, entered_at DESC),
  INDEX idx_osh_order_left         (order_id, left_at),
  INDEX idx_osh_stage              (stage),
  INDEX idx_osh_stage_expected     (stage, expected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单阶段状态机轨迹表';

-- ============================================================
-- 23. order_reminders（教务端：节点提醒实例表）
-- 业务来源：v1 原型订单录入「状态信息」板块 + doc/运营中台四端口 8.4 教务提醒
- 提醒类型：
--   first_week_check   首周查稿
--   weekly_check       每周查稿
--   under_review       投稿后一周入 Under Review 提醒
--   urge_letter        催稿信
--   revision           返修
--   page_fee           版面费
--   proof              校稿
--   online             Online
--   indexed            检索
--   index_report       检索审查报告
-- 业务规则：
--   - due_at 到期时由 RemindersService 扫描
--   - 同一 (order_id, reminder_type) 在同一天仅发一次
--   - 与 order_node_remind_log 互补：log 负责幂等，reminders 负责业务实例
-- ============================================================
CREATE TABLE IF NOT EXISTS order_reminders (
  id            VARCHAR(64)  PRIMARY KEY,
  order_id      VARCHAR(64)  NOT NULL COMMENT '所属订单ID（orders.id）',
  reminder_type VARCHAR(32)  NOT NULL COMMENT '提醒类型：first_week_check/weekly_check/under_review/urge_letter/revision/page_fee/proof/online/indexed/index_report',
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '状态：pending待发送/sent已发送/dismissed已忽略',
  due_at        DATETIME     NOT NULL COMMENT '到期时间',
  sent_at       DATETIME     NULL COMMENT '实际发送时间',
  receiver_id   VARCHAR(64)  NULL COMMENT '接收人ID（users.id）',
  note          TEXT         NULL COMMENT '提醒备注',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_or_order              (order_id),
  INDEX idx_or_due_status         (status, due_at),
  INDEX idx_or_type               (reminder_type),
  INDEX idx_or_order_type         (order_id, reminder_type),
  INDEX idx_or_receiver_status    (receiver_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单节点提醒实例表';

-- ============================================================
-- 24. order_finance（教务端：订单财务扩展）
-- 业务来源：v1 原型订单录入「财务信息」板块
-- 业务规则：
--   - orders.amount 存订单额冗余
--   - order_finance 拆 6 字段：订单额/已付/待付 + 老师接单价/已付/待付
--   - 1:1 关系（UNIQUE order_id），便于单独权限管理
-- ============================================================
CREATE TABLE IF NOT EXISTS order_finance (
  id              VARCHAR(64)   PRIMARY KEY,
  order_id        VARCHAR(64)   NOT NULL UNIQUE COMMENT '所属订单ID（orders.id，1:1）',
  order_amount    DECIMAL(12,2) NULL COMMENT '订单额（冗余存一份）',
  client_paid     DECIMAL(12,2) NULL COMMENT '订单已付款',
  client_pending  DECIMAL(12,2) NULL COMMENT '订单待支付',
  teacher_price   DECIMAL(12,2) NULL COMMENT '老师接单价格',
  teacher_paid    DECIMAL(12,2) NULL COMMENT '老师已付款',
  teacher_pending DECIMAL(12,2) NULL COMMENT '老师待付款',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单财务扩展表（订单额/已付/待付 + 老师接单价/已付/待付）';

-- ============================================================
-- 25. scraping_alerts
-- backend/src/modules/scraping/scraping-alert.entity.ts + backend/migrations/add-scraping-alerts-table.sql
-- 抓取告警表：抓取连续失败 / 累计失败到阈值时自动写入
--   - 连续失败 3 次（fail_streak === 3）  → level=error 一条
--   - 累计失败 10/30/50/100 次（total_failed 跨阈值）→ level=warn 一条
-- 状态机：未处理 / 已 owner 手动 mark resolve；不做自动 resolve
-- 权限：仅 owner 角色可通过 /api/scraping-alerts 列表/stats/resolve/lock-status 四个端点访问
--   - L1 / L2 / L3 校验与现有 owner-only 端点（operation-logs、scraping-alerts 等）一致
-- 列名 event_code 避开 MySQL 保留字 trigger
-- event_code 取值：streak_3 / total_10 / total_30 / total_50 / total_100
-- source 取值：fetch-metrics / refresh-metrics / parse-link / parser
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抓取告警表（owner 专属：抓取连续/累计失败到阈值时自动写入）';
