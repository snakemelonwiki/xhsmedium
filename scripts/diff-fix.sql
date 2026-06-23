-- AUTO-GENERATED 由 scripts/diff-schema-vs-db.mjs 生成
-- 使用前请检查；建议先在测试库执行

SET NAMES utf8mb4;

-- ============= 缺失列 =============
ALTER TABLE `posts` ADD COLUMN `is_supervisor_picked` TINYINT NOT NULL DEFAULT 0;
ALTER TABLE `posts` ADD COLUMN `supervisor_picked_by` VARCHAR(64) NULL;
ALTER TABLE `posts` ADD COLUMN `supervisor_picked_at` DATETIME NULL;
ALTER TABLE `leads` ADD COLUMN `is_dispatched` TINYINT NOT NULL DEFAULT 0;
ALTER TABLE `leads` ADD COLUMN `client_degree` VARCHAR(32) NULL;
ALTER TABLE `leads` ADD COLUMN `client_major_research` VARCHAR(255) NULL;
ALTER TABLE `leads` ADD COLUMN `client_time_requirement` VARCHAR(255) NULL;
ALTER TABLE `leads` ADD COLUMN `objection_point` TEXT NULL;
ALTER TABLE `leads` ADD COLUMN `follow_action` TEXT NULL;
ALTER TABLE `leads` ADD COLUMN `follow_action_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `product_type` VARCHAR(32) NULL;
ALTER TABLE `orders` ADD COLUMN `guarantee_type` VARCHAR(16) NULL;
ALTER TABLE `orders` ADD COLUMN `payment_stage` VARCHAR(64) NULL;
ALTER TABLE `orders` ADD COLUMN `order_code` VARCHAR(32) NULL;
ALTER TABLE `orders` ADD COLUMN `education_level` VARCHAR(32) NULL;
ALTER TABLE `orders` ADD COLUMN `major` VARCHAR(128) NULL;
ALTER TABLE `orders` ADD COLUMN `area` VARCHAR(128) NULL;
ALTER TABLE `orders` ADD COLUMN `article_purpose` VARCHAR(128) NULL;
ALTER TABLE `orders` ADD COLUMN `submit_email` VARCHAR(128) NULL;
ALTER TABLE `orders` ADD COLUMN `submit_email_password` VARCHAR(128) NULL;
ALTER TABLE `orders` ADD COLUMN `fund_info` TEXT NULL;
ALTER TABLE `orders` ADD COLUMN `registration_status` VARCHAR(32) NOT NULL DEFAULT 'pending';
ALTER TABLE `orders` ADD COLUMN `handover_to_teacher_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `checked_duplicate` TINYINT NOT NULL DEFAULT 0;
ALTER TABLE `orders` ADD COLUMN `dispatched_teacher_id` VARCHAR(64) NULL;
ALTER TABLE `orders` ADD COLUMN `teacher_id` VARCHAR(64) NULL;
ALTER TABLE `orders` ADD COLUMN `teacher_phone` VARCHAR(64) NULL;
ALTER TABLE `orders` ADD COLUMN `teacher_stability` VARCHAR(16) NULL;
ALTER TABLE `orders` ADD COLUMN `innovation_review_status` VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE `orders` ADD COLUMN `innovation_review_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `draft_review_status` VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE `orders` ADD COLUMN `draft_review_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `editor_review_status` VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE `orders` ADD COLUMN `editor_review_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `author_verify_status` VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE `orders` ADD COLUMN `author_verify_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `paper_progress` VARCHAR(32) NULL;
ALTER TABLE `orders` ADD COLUMN `current_stage` VARCHAR(32) NULL;
ALTER TABLE `orders` ADD COLUMN `first_week_check_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `next_check_at` DATETIME NULL;
ALTER TABLE `orders` ADD COLUMN `urge_letter_status` VARCHAR(16) NOT NULL DEFAULT 'not_sent';
ALTER TABLE `orders` ADD COLUMN `revision_status` VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE `orders` ADD COLUMN `page_fee_status` VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE `orders` ADD COLUMN `proof_status` VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE `orders` ADD COLUMN `online_status` VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE `orders` ADD COLUMN `indexed_status` VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE `orders` ADD COLUMN `index_review_report` VARCHAR(500) NULL;
ALTER TABLE `orders` ADD COLUMN `risk_level` VARCHAR(16) NOT NULL DEFAULT 'low';
ALTER TABLE `orders` ADD COLUMN `order_stage` VARCHAR(64) NULL;
ALTER TABLE `orders` ADD COLUMN `next_follow_at` DATETIME NULL;

-- ============= 缺失表 =============
CREATE TABLE IF NOT EXISTS orders_order_code_seq (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  seq_date    DATE         NOT NULL COMMENT '序号日期（YYYY-MM-DD，按 UTC+8 分界）',
  current_seq INT          NOT NULL DEFAULT 0 COMMENT '当日已用最大序号（0 = 尚未使用）',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE INDEX uk_orders_order_code_seq_date (seq_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单号序列表（按日自增）';

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

