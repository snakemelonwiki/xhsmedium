-- ============================================================
-- M25: align local database to schema.sql  (down)
-- 反向操作 M25 up: 删除补齐的列/索引/表
-- 注意：M25 涉及的列/索引都是补齐形态；删除它们不会破坏数据完整性。
-- ============================================================

USE lan_dual_role_system;

-- 1. supervisor_suggestions 索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_employee_id');
SET @ddl := IF(@idx_exists > 0, 'ALTER TABLE supervisor_suggestions DROP INDEX idx_ss_employee_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_target');
SET @ddl := IF(@idx_exists > 0, 'ALTER TABLE supervisor_suggestions DROP INDEX idx_ss_target', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_receiver');
SET @ddl := IF(@idx_exists > 0, 'ALTER TABLE supervisor_suggestions DROP INDEX idx_ss_receiver', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS supervisor_suggestions;

-- 2. import_tasks 新字段
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'updated_at');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE import_tasks DROP COLUMN updated_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'error_message');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE import_tasks DROP COLUMN error_message', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'result_json');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE import_tasks DROP COLUMN result_json', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'payload_json');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE import_tasks DROP COLUMN payload_json', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. order_follow_records 附件字段
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_follow_records' AND COLUMN_NAME = 'attachment_name');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE order_follow_records DROP COLUMN attachment_name', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_follow_records' AND COLUMN_NAME = 'attachment_url');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE order_follow_records DROP COLUMN attachment_url', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. leads.deal_status
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'deal_status');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE leads DROP COLUMN deal_status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. post_metrics 新列
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'updated_at');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE post_metrics DROP COLUMN updated_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'views');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE post_metrics DROP COLUMN views', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'traffic');
SET @ddl := IF(@col_exists > 0, 'ALTER TABLE post_metrics DROP COLUMN traffic', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. leads.add_status_created 等 v1.2 性能索引 (M21 + 散落)
DROP INDEX IF EXISTS idx_leads_post_id ON leads;
DROP INDEX IF EXISTS idx_leads_platform ON leads;
DROP INDEX IF EXISTS idx_leads_status ON leads;
DROP INDEX IF EXISTS idx_leads_process_status ON leads;
DROP INDEX IF EXISTS idx_leads_deal_status ON leads;
DROP INDEX IF EXISTS idx_leads_add_status ON leads;
DROP INDEX IF EXISTS idx_leads_assigned_sales_user_id ON leads;
DROP INDEX IF EXISTS idx_leads_next_follow ON leads;
DROP INDEX IF EXISTS idx_leads_employee_created ON leads;
DROP INDEX IF EXISTS idx_leads_sales_process ON leads;
DROP INDEX IF EXISTS idx_leads_status_created ON leads;
DROP INDEX IF EXISTS idx_leads_add_status_created ON leads;
DROP INDEX IF EXISTS idx_leads_process_status_created ON leads;
DROP INDEX IF EXISTS idx_leads_platform_created ON leads;

-- 7. 各表散落索引
DROP INDEX IF EXISTS idx_users_role ON users;
DROP INDEX IF EXISTS idx_users_employee_id ON users;
DROP INDEX IF EXISTS idx_accounts_platform ON accounts;
DROP INDEX IF EXISTS idx_accounts_status ON accounts;
DROP INDEX IF EXISTS idx_posts_platform ON posts;
DROP INDEX IF EXISTS idx_posts_post_type ON posts;
DROP INDEX IF EXISTS idx_posts_employee_published ON posts;
DROP INDEX IF EXISTS idx_posts_account_published ON posts;
DROP INDEX IF EXISTS idx_posts_platform_type_published ON posts;
DROP INDEX IF EXISTS idx_follow_lead_created ON lead_follow_records;
DROP INDEX IF EXISTS idx_drafts_user_type_updated ON lead_drafts;
DROP INDEX IF EXISTS idx_collab_status_created ON collaboration_tasks;
DROP INDEX IF EXISTS idx_orders_order_status_created ON orders;
DROP INDEX IF EXISTS idx_orders_paid_status_created ON orders;
DROP INDEX IF EXISTS idx_notify_receiver_read_created ON notifications;
DROP INDEX IF EXISTS idx_exports_user_created ON exports;
DROP INDEX IF EXISTS idx_exports_user_type_created ON exports;
DROP INDEX IF EXISTS idx_fav_target ON favorites;
