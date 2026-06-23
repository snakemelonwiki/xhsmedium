-- v1.4 财务系统三张新表（Phase D）
-- 迁移说明：
--   order_payments   客户分阶段回款（closeDeal 自动插入 source='sales_close'）
--   teacher_payments   老师分阶段付款
--   other_expenses     其他支出（公司运营成本，可选关联订单）

-- ============================================
-- order_payments
-- ============================================
CREATE TABLE IF NOT EXISTS order_payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  stage_code VARCHAR(16) NOT NULL COMMENT '阶段编码: deposit/midterm/final/extra',
  stage_label VARCHAR(32) DEFAULT NULL COMMENT '展示名（如"定金""中期""尾款"）',
  stage_index INT NOT NULL DEFAULT 0 COMMENT '0=定金 1=中期 2=尾款 3=额外',
  amount DECIMAL(12,2) DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL COMMENT '实际支付时间',
  note VARCHAR(255) DEFAULT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'finance_manual' COMMENT 'sales_close=销售成交自动录入; finance_manual=财务手工录入',
  recorded_by VARCHAR(64) DEFAULT NULL COMMENT '录入人 userId',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_payments_order_stage (order_id, stage_code),
  KEY idx_order_payments_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- teacher_payments
-- ============================================
CREATE TABLE IF NOT EXISTS teacher_payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  teacher_id VARCHAR(64) NOT NULL,
  stage_code VARCHAR(16) NOT NULL COMMENT '阶段编码: draft/revision/acceptance',
  stage_label VARCHAR(32) DEFAULT NULL COMMENT '展示名（如"初稿支付""返修支付""录用支付"）',
  amount DECIMAL(12,2) DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL COMMENT '实际支付时间',
  note VARCHAR(255) DEFAULT NULL,
  recorded_by VARCHAR(64) DEFAULT NULL COMMENT '录入人 userId',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_teacher_payments_order_teacher_stage (order_id, teacher_id, stage_code),
  KEY idx_teacher_payments_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- other_expenses
-- ============================================
CREATE TABLE IF NOT EXISTS other_expenses (
  id VARCHAR(64) PRIMARY KEY,
  category VARCHAR(64) NOT NULL COMMENT '支出分类',
  amount DECIMAL(12,2) NOT NULL,
  occurred_at DATETIME DEFAULT NULL COMMENT '实际发生时间',
  note TEXT DEFAULT NULL,
  attachment_url VARCHAR(500) DEFAULT NULL COMMENT '附件URL',
  recorded_by VARCHAR(64) DEFAULT NULL COMMENT '录入人 userId',
  related_order_id VARCHAR(64) DEFAULT NULL COMMENT '可选关联订单（分摊到该订单利润）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_other_expenses_related_order_id (related_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
