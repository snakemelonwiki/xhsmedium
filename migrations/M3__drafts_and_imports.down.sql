-- ============================================================
-- M3 回滚：删除 M3 新建的表
-- ⚠ 删除会丢失 collaboration_tasks / orders / notifications / exports /
--    lead_drafts / import_tasks / post_metrics_history / favorites 的数据
-- ============================================================

USE lan_dual_role_system;

DROP TABLE IF EXISTS exports;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS order_follow_records;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS collaboration_tasks;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS post_metrics_history;
DROP TABLE IF EXISTS import_tasks;
DROP TABLE IF EXISTS lead_drafts;
