-- 回退 M22
USE lan_dual_role_system;

DROP TABLE IF EXISTS order_node_remind_log;

ALTER TABLE orders DROP COLUMN last_status_change_at;
