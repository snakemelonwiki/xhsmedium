-- ============================================================
-- M3: 草稿表 + 导入任务 + 协同/订单/通知/导出 重建
--   背景：当前数据库中 collaboration_tasks / orders / order_follow_records /
--         notifications / exports 是早期 ddl/04, ddl/05 留下的 BIGINT 自增风格，
--         均为空表；本迁移 DROP 后按 VARCHAR(64) UUID 风格重建，与 schema.sql 对齐。
--         同时补建 schema.sql 里声明但当前库缺失的 lead_drafts / import_tasks /
--         post_metrics_history / favorites。
--   ⚠ 执行前确认上述 5 张 BIGINT 表为空（已验证）。若已有业务数据，请改走自定义迁移。
-- ============================================================

USE lan_dual_role_system;

-- 3.0 删除旧 BIGINT 风格表（已确认为空）
DROP TABLE IF EXISTS exports;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS order_follow_records;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS collaboration_tasks;

-- 3.1 lead_drafts（schema.sql 已声明，库里缺失，按声明建）
CREATE TABLE IF NOT EXISTS lead_drafts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  draft_type VARCHAR(32) NOT NULL COMMENT 'leads/posts等',
  content_json TEXT NOT NULL,
  image_urls JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_drafts_user_id (user_id),
  INDEX idx_drafts_user_type_updated (user_id, draft_type, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='录入草稿（客资/作品共用）';

-- 3.2 import_tasks（schema.sql 已声明，库里缺失；按方案 §8.1 补全字段）
CREATE TABLE IF NOT EXISTS import_tasks (
  id            VARCHAR(64) PRIMARY KEY,
  import_type   VARCHAR(32) NOT NULL                COMMENT 'leads/posts',
  user_id       VARCHAR(64) NOT NULL,
  total_count   INT NOT NULL DEFAULT 0              COMMENT '总条目数',
  success_count INT NOT NULL DEFAULT 0,
  fail_count    INT NOT NULL DEFAULT 0,
  error_file_url VARCHAR(500) NULL                  COMMENT '失败行 CSV 下载地址',
  status        VARCHAR(32) NOT NULL DEFAULT 'processing'
                COMMENT 'processing/done/failed',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME NULL,
  INDEX idx_import_user_id (user_id),
  INDEX idx_import_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='批量导入任务';

-- 3.3 post_metrics_history（schema.sql 已声明，库里缺失）
CREATE TABLE IF NOT EXISTS post_metrics_history (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  favorites BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  leads_count BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_history_post_id (post_id),
  INDEX idx_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='作品指标历史';

-- 3.4 favorites（schema.sql 已声明，库里缺失）
CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL COMMENT 'post/account',
  target_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fav_user_id (user_id),
  UNIQUE KEY idx_fav_user_target (user_id, target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='收藏（学习榜单/账号）';

-- 3.5 协同任务表（VARCHAR(64) 风格）
CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id            VARCHAR(64) PRIMARY KEY,
  lead_id       VARCHAR(64) NOT NULL                     COMMENT '关联客资 leads.id',
  requester_id  VARCHAR(64) NOT NULL                     COMMENT '销售发起人 users.id',
  handler_id    VARCHAR(64) NULL                         COMMENT '运营处理人 users.id',
  type          ENUM('remind_customer','supplement_info','verify_identity','second_touch')
                NOT NULL                                 COMMENT '协同类型',
  reason        TEXT NULL                                COMMENT '发起原因',
  status        ENUM('pending','handling','handled','closed')
                NOT NULL DEFAULT 'pending'               COMMENT '状态',
  handled_note  TEXT NULL                                COMMENT '处理记录',
  requested_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at    DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collab_lead       (lead_id),
  INDEX idx_collab_requester  (requester_id),
  INDEX idx_collab_handler    (handler_id),
  INDEX idx_collab_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='协同任务表（销售→运营）';

-- 3.6 订单表
CREATE TABLE IF NOT EXISTS orders (
  id                  VARCHAR(64) PRIMARY KEY,
  lead_id             VARCHAR(64) NOT NULL                COMMENT '来源客资 leads.id',
  sales_user_id       VARCHAR(64) NOT NULL                COMMENT '销售 users.id',
  academic_user_id    VARCHAR(64) NULL                    COMMENT '教务 users.id',
  service_type        VARCHAR(64) NULL                    COMMENT '服务类型',
  amount              DECIMAL(12,2) NULL                  COMMENT '成交金额',
  paid_status         ENUM('unpaid','partial','paid')
                       NOT NULL DEFAULT 'unpaid'           COMMENT '付款状态',
  order_status        ENUM('to_receive','in_progress','awaiting_client_info','awaiting_teacher','to_deliver','completed','abnormal')
                       NOT NULL DEFAULT 'to_receive'       COMMENT '订单状态',
  remark              TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_lead         (lead_id),
  INDEX idx_orders_sales        (sales_user_id),
  INDEX idx_orders_academic     (academic_user_id),
  INDEX idx_orders_order_status (order_status),
  INDEX idx_orders_created_at   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='订单表（成交后由 leads 转化）';

-- 3.7 订单跟进记录
CREATE TABLE IF NOT EXISTS order_follow_records (
  id              VARCHAR(64) PRIMARY KEY,
  order_id        VARCHAR(64) NOT NULL                    COMMENT '关联 orders.id',
  user_id         VARCHAR(64) NOT NULL                    COMMENT '教务 users.id',
  node_type       VARCHAR(32) NOT NULL                    COMMENT '资料收集/老师安排/节点完成/异常等',
  content         TEXT NULL,
  next_remind_at  DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ofr_order (order_id),
  INDEX idx_ofr_user  (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='订单跟进/异常记录（不可变）';

-- 3.8 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id            VARCHAR(64) PRIMARY KEY,
  receiver_id   VARCHAR(64) NOT NULL                      COMMENT '接收者 users.id',
  sender_id     VARCHAR(64) NULL                          COMMENT '发送者 users.id；系统为 NULL',
  port_type     VARCHAR(32) NOT NULL                      COMMENT '所属端口: operations/sales/academic/supervisor/owner',
  type_code     VARCHAR(64) NOT NULL                      COMMENT '通知 code（见 §11.1 枚举表）',
  title         VARCHAR(255) NOT NULL,
  content       TEXT NULL,
  related_id    VARCHAR(64) NULL                          COMMENT '业务实体ID',
  related_type  VARCHAR(32) NULL                          COMMENT 'lead/order/collaboration_task/post/account',
  read_status   TINYINT(1) NOT NULL DEFAULT 0             COMMENT '0未读 1已读',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notify_receiver_read_created (receiver_id, read_status, created_at),
  INDEX idx_notify_type                  (type_code),
  INDEX idx_notify_related               (related_type, related_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='系统通知';

-- 3.9 异步导出任务
CREATE TABLE IF NOT EXISTS exports (
  id            VARCHAR(64) PRIMARY KEY,
  user_id       VARCHAR(64) NOT NULL                      COMMENT '发起人 users.id',
  export_type   VARCHAR(32) NOT NULL                      COMMENT 'leads/orders/collaboration_records/posts/rankings',
  filter_json   TEXT NULL                                 COMMENT '筛选条件 JSON',
  file_url      VARCHAR(500) NULL                         COMMENT '生成文件下载地址',
  status        ENUM('pending','processing','completed','failed')
                NOT NULL DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exports_user        (user_id),
  INDEX idx_exports_status      (status),
  INDEX idx_exports_created_at  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='导出任务';
