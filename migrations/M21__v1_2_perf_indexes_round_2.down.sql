-- M21__v1_2_perf_indexes_round_2.down.sql
-- 回滚 M21__v1_2_perf_indexes_round_2.up.sql 中新增的所有索引
-- 来源：原 backend/migrations/M17__v1_2_perf_indexes_round_2.down.sql

USE lan_dual_role_system;

ALTER TABLE collaboration_tasks DROP INDEX idx_collab_status_created;
ALTER TABLE leads DROP INDEX idx_leads_status_created;
ALTER TABLE leads DROP INDEX idx_leads_add_status_created;
ALTER TABLE leads DROP INDEX idx_leads_process_status_created;
ALTER TABLE leads DROP INDEX idx_leads_platform_created;
ALTER TABLE posts DROP INDEX idx_posts_platform_type_published;
ALTER TABLE order_follow_records DROP INDEX idx_order_follow_remind_due;
ALTER TABLE orders DROP INDEX idx_orders_order_status_created;
ALTER TABLE orders DROP INDEX idx_orders_paid_status_created;
