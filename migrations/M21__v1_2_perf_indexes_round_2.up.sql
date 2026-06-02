-- ============================================================
-- M21: B 端 v1.2 性能索引补漏 (Round 2)
-- 来源：原 backend/migrations/M17__v1_2_perf_indexes_round_2.up.sql
--       经 v1.2 P1 修复统一迁入主 migrations 链
-- 复核范围：collaboration_tasks / leads / posts / post_metrics /
--          order_follow_records / orders / exports / notifications
--
-- 1. collaboration_tasks
--    scanTimeouts() 查询：WHERE status IN ('pending','handling') AND createdAt <= ?
--    现有 idx_collab_status (status 单列)，无法同时过滤 status + createdAt 排序。
--    加 (status, created_at) 覆盖复合过滤 + 升序扫描路径。
--
-- 2. leads
--    applyLeadFilters() 常见组合：(status) + (add_status) + (process_status) + (platform) 等单列过滤。
--    applyLeadFilters() 主列表默认 order by created_at DESC。
--    已有 idx_leads_employee_created / idx_leads_sales_process / idx_leads_next_follow。
--    补单一字段过滤时走 (status, created_at) / (add_status, created_at) / (process_status, created_at)
--    / (platform, created_at)，覆盖各独立筛选条件的列表页。
--
-- 3. posts
--    findPaged() 查询：employee_id + account_id + platform + post_type + published_at 多种过滤，
--    已有 idx_posts_employee_published (employee_id, published_at)、
--    idx_posts_account_published (account_id, published_at)。
--    补 (platform, post_type, published_at) 复合索引覆盖多平台/类型组合查询。
--
-- 4. post_metrics
--    按 post_id + date 查（已有 unique key idx_metrics_post_collected）。
--    榜单还常按 date 排序查全部，按 date DESC 也已通过 idx_metrics_date(date) 覆盖。
--    本轮无需新增。
--
-- 5. order_follow_records
--    scanDue() 查询：WHERE next_remind_at <= NOW() AND reminder_sent_at IS NULL
--    现有 idx_order_follow_order_id / idx_order_follow_user_id。
--    补 (next_remind_at, reminder_sent_at) 覆盖到期未发提醒扫描路径。
--
-- 6. orders
--    list() / listPaged() 查询：order_status / paid_status / sales_user_id / created_at 组合过滤。
--    已有 idx_orders_sales_user_id / idx_orders_academic_user_id / idx_orders_handover_status。
--    补 (order_status, created_at) / (paid_status, created_at) 覆盖各状态列表页。
--
-- 7. exports
--    已通过 add-p1-exports-indexes.sql 加了 (user_id, created_at) 和
--    (user_id, export_type, created_at)。本轮无需新增。
--
-- 8. notifications
--    已有 (receiver_id, read_status, created_at DESC) 索引（实体 + add-performance-indexes.sql）。
--    本轮无需新增。
-- ============================================================

USE lan_dual_role_system;

-- 1. collaboration_tasks: 复合过滤 + 扫描路径
ALTER TABLE collaboration_tasks ADD INDEX idx_collab_status_created (status, created_at);

-- 2. leads: 各单列筛选条件的列表优化
ALTER TABLE leads ADD INDEX idx_leads_status_created (status, created_at);
ALTER TABLE leads ADD INDEX idx_leads_add_status_created (add_status, created_at);
ALTER TABLE leads ADD INDEX idx_leads_process_status_created (process_status, created_at);
ALTER TABLE leads ADD INDEX idx_leads_platform_created (platform, created_at);

-- 3. posts: 平台+类型组合列表优化
ALTER TABLE posts ADD INDEX idx_posts_platform_type_published (platform, post_type, published_at);

-- 4. order_follow_records: 到期提醒扫描路径
ALTER TABLE order_follow_records ADD INDEX idx_order_follow_remind_due (next_remind_at, reminder_sent_at);

-- 5. orders: 状态筛选列表优化
ALTER TABLE orders ADD INDEX idx_orders_order_status_created (order_status, created_at);
ALTER TABLE orders ADD INDEX idx_orders_paid_status_created (paid_status, created_at);
