-- ============================================================
-- M22: 教务节点提醒完整规则 (P2-B)
-- 来源：doc/v1.2-完整交付版-AB端任务分配.md § 8.4 P2-B
--       "教务节点提醒完整规则"
-- 落点：
--   1) orders 表新增 last_status_change_at，记录最近一次
--      orderStatus 字段变更的时间。已有订单回填为 orders.updated_at
--      的值（保证新规则的"进入状态时间"判定有数据可用）。
--   2) 新增 order_node_remind_log 表，存每订单每规则的最近发送时间，
--      用于幂等去重（同订单同规则 1 天内最多发 1 次）。
-- 备注：
--   - last_status_change_at 与 orders.updated_at 不同：后者会在 remark
--     / amount / service_type 等非 status 字段变更时被刷新，前者仅在
--     orderStatus 字段变更时刷新。判定"进入 X 状态多久"用前者更准确。
--   - 后续 orders.service.update / acceptHandover / abnormal-feedback
--     三个写 orderStatus 的入口都会同步更新 last_status_change_at。
-- ============================================================

USE lan_dual_role_system;

-- 1) orders.last_status_change_at
ALTER TABLE orders
  ADD COLUMN last_status_change_at DATETIME NULL
    COMMENT '最近一次 orderStatus 变更时间，用于节点提醒进入状态计时'
    AFTER updated_at;

-- 回填已有订单：用 updated_at 兜底（不精准但保证新规则有值可查）
UPDATE orders
  SET last_status_change_at = updated_at
  WHERE last_status_change_at IS NULL;

-- 2) order_node_remind_log
CREATE TABLE IF NOT EXISTS order_node_remind_log (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  order_id        VARCHAR(64)  NOT NULL
                  COMMENT '订单 ID（orders.id）',
  rule_code       VARCHAR(64)  NOT NULL
                  COMMENT '规则 code：awaiting_client_info/awaiting_teacher/to_deliver/in_progress_client_silent',
  last_sent_at    DATETIME     NOT NULL
                  COMMENT '最近一次发送时间',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                  COMMENT '记录创建时间',
  UNIQUE KEY uk_order_rule (order_id, rule_code),
  KEY idx_order_node_remind_log_order (order_id),
  KEY idx_order_node_remind_log_rule_last (rule_code, last_sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='订单节点提醒幂等日志（同订单同规则 1 天内最多发 1 次）';
