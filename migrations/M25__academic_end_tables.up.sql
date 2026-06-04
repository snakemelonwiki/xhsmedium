-- ============================================================
    -- M25: 教务端表结构扩展（v1.3 教务端能力落地）
--
-- 业务来源：doc/运营中台四端口 第十六/十七章
--   - 第十六章：v1 原型业务参考
--   - 第十七章：新架构实现说明 + 17.4 数据模型扩展
--   - 17.7 落地路径第 1 步：扩展 schema.sql，加入教务端相关表
--
-- 变更内容：
--   1. 新增 6 张表：teachers / order_authors / order_submissions /
--      order_status_history / order_reminders / order_finance
--   2. 扩展 orders 表：客户基础信息、派单/审核/进度、阶段/查稿/状态、风险等级等
--   3. 同步追加索引
--
-- 与已有表的关系：
--   - order_abnormal_feedbacks（M13）已存在，本迁移不重建
--   - order_node_remind_log（M22）按规则幂等，order_reminders 按业务实例拆分
--   - teachers 与 orders.teacher_id / orders.dispatched_teacher_id 逻辑关联
--   - 财务字段在 order_finance 1:1 拆分，orders.amount 仍保留冗余
--
-- 幂等：所有 ALTER 使用 IF NOT EXISTS / IF EXISTS 兼容 MySQL 8.0+
--     索引使用同名重建（idempotent）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 扩展 orders 表字段
-- ============================================================

-- 客户基础信息扩展
ALTER TABLE orders ADD COLUMN IF NOT EXISTS education_level VARCHAR(32)  NULL COMMENT '学历层级：本科/硕士/博士/其他';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS major VARCHAR(128) NULL COMMENT '专业方向';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS area VARCHAR(128) NULL COMMENT '所需区位';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS article_purpose VARCHAR(128) NULL COMMENT '文章用途';

-- 作者/投稿邮箱/基金/登记表相关
ALTER TABLE orders ADD COLUMN IF NOT EXISTS submit_email VARCHAR(128) NULL COMMENT '投稿邮箱';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS submit_email_password VARCHAR(128) NULL COMMENT '投稿邮箱密码';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fund_info TEXT NULL COMMENT '基金信息';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS registration_status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '个人信息登记表状态：pending/partial/collected';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handover_to_teacher_at DATETIME NULL COMMENT '传递给老师时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checked_duplicate TINYINT NOT NULL DEFAULT 0 COMMENT '是否查重：0否 1是';

-- 派单/接单/审核/进度
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_teacher_id VARCHAR(64) NULL COMMENT '派单老师ID（teachers.id）';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(64) NULL COMMENT '接单老师ID（teachers.id）';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS teacher_phone VARCHAR(64) NULL COMMENT '老师电话';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS teacher_stability VARCHAR(16) NULL COMMENT '老师稳定性：stable/new/probation';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS innovation_review_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '创新点审核：pending/passed/rejected/skipped';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS innovation_review_at DATETIME NULL COMMENT '创新点审核时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS draft_review_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '初稿审核：pending/passed/rejected';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS draft_review_at DATETIME NULL COMMENT '初稿审核时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS editor_review_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '编辑老师审查：pending/passed/rejected';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS editor_review_at DATETIME NULL COMMENT '编辑审查时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS author_verify_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '投稿前作者信息核对：pending/passed/rejected';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS author_verify_at DATETIME NULL COMMENT '作者信息核对时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paper_progress VARCHAR(32) NULL COMMENT '论文进度';

-- 阶段/查稿/状态
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_stage VARCHAR(32) NULL COMMENT '当前真实阶段：Submitted/WithEditor/UnderReview/Revision/Accepted/Proofing/Online/Indexed/Rejected';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_week_check_at DATETIME NULL COMMENT '首周查稿时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_check_at DATETIME NULL COMMENT '下次查稿时间';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS urge_letter_status VARCHAR(16) NOT NULL DEFAULT 'not_sent' COMMENT '催稿信状态：not_sent/sent/replied';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS revision_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '返修状态：none/required/in_progress/completed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS page_fee_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '版面费状态：none/required/paid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proof_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '校稿状态：none/in_progress/completed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT 'Online 状态：none/in_progress/published';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS indexed_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '检索状态：none/in_progress/indexed/failed';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS index_review_report VARCHAR(500) NULL COMMENT '检索审查报告附件URL';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) NOT NULL DEFAULT 'low' COMMENT '风险等级：low/mid/high';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_stage VARCHAR(64) NULL COMMENT '订单阶段';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_follow_at DATETIME NULL COMMENT '下次跟进时间';

-- 同步 orders 表注释
ALTER TABLE orders COMMENT = '订单表（教务端字段扩展：客户基础/作者邮箱/老师派单/审核/阶段/查稿/风险）';

-- ============================================================
-- 2. orders 表追加索引（IF NOT EXISTS 兼容 MySQL 8.0+）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_teacher_id             ON orders (teacher_id);
CREATE INDEX IF NOT EXISTS idx_orders_dispatched_teacher_id  ON orders (dispatched_teacher_id);
CREATE INDEX IF NOT EXISTS idx_orders_current_stage          ON orders (current_stage);
CREATE INDEX IF NOT EXISTS idx_orders_paper_progress         ON orders (paper_progress);
CREATE INDEX IF NOT EXISTS idx_orders_risk_level             ON orders (risk_level);
CREATE INDEX IF NOT EXISTS idx_orders_next_check_at          ON orders (next_check_at);
CREATE INDEX IF NOT EXISTS idx_orders_next_follow_at         ON orders (next_follow_at);

-- ============================================================
-- 3. 新增 teachers 表（稳定老师库）
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
-- 4. 新增 order_authors 表（订单多作者信息）
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
-- 5. 新增 order_submissions 表（1-3 组投稿信息）
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
-- 6. 新增 order_status_history 表（9 阶段状态机轨迹）
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
-- 7. 新增 order_reminders 表（节点提醒实例表）
-- ============================================================
CREATE TABLE IF NOT EXISTS order_reminders (
  id            VARCHAR(64)  PRIMARY KEY,
  order_id      VARCHAR(64)  NOT NULL COMMENT '所属订单ID（orders.id）',
  reminder_type VARCHAR(32)  NOT NULL COMMENT '提醒类型：first_week_check/weekly_check/under_review/urge_letter/revision/page_fee/proof/online/indexed/index_report',
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '状态：pending/sent/dismissed',
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
-- 8. 新增 order_finance 表（订单财务扩展）
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

SET FOREIGN_KEY_CHECKS = 1;
