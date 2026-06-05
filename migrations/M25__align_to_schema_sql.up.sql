-- ============================================================
-- M25: align local database to schema.sql
-- 用途：本地数据库与 schema.sql 差异补齐（idempotent）
-- 与项目自带 M17~M24 的关系：
--   M17~M24 大部分 ALTER 不带 IF NOT EXISTS 兜底，且 M17 CREATE TABLE IF NOT EXISTS
--   不会重建已有但结构不同的 post_metrics；M24 字段与 schema.sql 不一致
--   （supervisor_id/operator_id vs sender_id/receiver_id/target_*）。
--   因此本迁移独立于 M17~M24，按 schema.sql 终态做幂等补齐。
-- 适用：MySQL 8.0+（IF NOT EXISTS / IF EXISTS 直接支持；下面所有 ADD INDEX 仍走
--       prepared-statement 模式，与项目 M16 风格保持一致）
-- 注意：每条 SQL 单独一行（splitStatements 按 ;\n 拆段）
-- ============================================================

USE lan_dual_role_system;

-- ============================================================
-- 1. leads.deal_status  (M18 字段，schema.sql §5)
-- ============================================================
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'deal_status')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE leads ADD COLUMN deal_status VARCHAR(32) NOT NULL DEFAULT ''not_deal'' COMMENT ''成交状态：not_deal/deal_pending/deal_done/refunded/invalid''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 2. order_follow_records.attachment_url / attachment_name  (M22 部分)
-- ============================================================
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_follow_records' AND COLUMN_NAME = 'attachment_url')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE order_follow_records ADD COLUMN attachment_url VARCHAR(512) NULL COMMENT ''附件 URL''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_follow_records' AND COLUMN_NAME = 'attachment_name')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE order_follow_records ADD COLUMN attachment_name VARCHAR(255) NULL COMMENT ''附件原始文件名''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 3. import_tasks 异步队列字段  (M23)
-- ============================================================
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'payload_json')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE import_tasks ADD COLUMN payload_json JSON NULL COMMENT ''上传文件URL或粘贴原始数据'' AFTER status', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'result_json')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE import_tasks ADD COLUMN result_json JSON NULL COMMENT ''成功/失败明细'' AFTER payload_json', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'error_message')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE import_tasks ADD COLUMN error_message TEXT NULL COMMENT ''最终错误信息'' AFTER result_json', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_tasks' AND COLUMN_NAME = 'updated_at')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE import_tasks ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT ''更新时间'' AFTER created_at', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 4. post_metrics  (M17 + 旧表缺列补齐)
-- 旧表 id/post_id 是 BIGINT，且缺 traffic/views/updated_at
-- 策略：把 id/post_id 改 VARCHAR(64)，并补 traffic/views/updated_at
-- ============================================================

-- 4.1 id: BIGINT → VARCHAR(64)
SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'id') = 'bigint', 'ALTER TABLE post_metrics MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT ''主键（UUID）''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 4.2 post_id: BIGINT → VARCHAR(64)
SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'post_id') = 'bigint', 'ALTER TABLE post_metrics MODIFY COLUMN post_id VARCHAR(64) NOT NULL COMMENT ''关联 posts.id''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 4.3 traffic
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'traffic')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE post_metrics ADD COLUMN traffic BIGINT NOT NULL DEFAULT 0 COMMENT ''来源流量（仅获客贴/营销贴）''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 4.4 views
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'views')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE post_metrics ADD COLUMN views BIGINT NOT NULL DEFAULT 0 COMMENT ''浏览数（可选）''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 4.5 updated_at
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_metrics' AND COLUMN_NAME = 'updated_at')
;
SET @ddl := IF(@col_exists = 0, 'ALTER TABLE post_metrics ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间''', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 5. users.role 扩展枚举  (M20)
-- 旧: enum('admin','staff','owner','sales','academic')
-- 新: enum('admin','staff','owner','sales','academic','operation','supervisor')
-- ============================================================
SET @sql := (SELECT IF(LOCATE('supervisor', (SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role')) = 0, 'ALTER TABLE users MODIFY COLUMN role ENUM(''admin'',''staff'',''owner'',''sales'',''academic'',''operation'',''supervisor'') NOT NULL COMMENT ''账号角色：admin/supervisor主管 | staff/operation运营员工 | owner总后台 | sales销售 | academic教务''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 6. orders.order_status / paid_status  ENUM → VARCHAR(32)  (M19)
-- ============================================================
SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'order_status') = 'enum', 'ALTER TABLE orders MODIFY COLUMN order_status VARCHAR(32) NOT NULL DEFAULT ''to_receive'' COMMENT ''订单状态：pending_accept/to_receive/in_progress/awaiting_client_info/awaiting_teacher/to_deliver/completed/abnormal/closed''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'paid_status') = 'enum', 'ALTER TABLE orders MODIFY COLUMN paid_status VARCHAR(32) NOT NULL DEFAULT ''unpaid'' COMMENT ''付款状态：unpaid/partial/paid/refunded''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 7. leads.intention_level / add_method  ENUM → VARCHAR(16)
-- 当前 ENUM 值与 VARCHAR 默认值一一对应，转换零数据丢失。
-- ============================================================
SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'intention_level') = 'enum', 'ALTER TABLE leads MODIFY COLUMN intention_level VARCHAR(16) NOT NULL DEFAULT ''pending'' COMMENT ''意向度''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @sql := (SELECT IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'add_method') = 'enum', 'ALTER TABLE leads MODIFY COLUMN add_method VARCHAR(16) NOT NULL DEFAULT ''unknown'' COMMENT ''添加方式''', 'SELECT 1'))
;
PREPARE stmt FROM @sql
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 8. supervisor_suggestions 建表  (按 schema.sql §18 终态)
-- M24 旧字段是 supervisor_id/operator_id/is_read/post_id/account_id，
-- 本迁移以 schema.sql 终态为准：sender_id/receiver_id/employee_id/target_type/target_id/read_status。
-- CREATE TABLE IF NOT EXISTS：旧表已存在则跳过，由 9 号段做索引兜底。
-- ============================================================
CREATE TABLE IF NOT EXISTS supervisor_suggestions (id VARCHAR(64) PRIMARY KEY, sender_id VARCHAR(64) NOT NULL COMMENT '发送者（主管）用户ID', receiver_id VARCHAR(64) NOT NULL COMMENT '接收者（运营）用户ID', employee_id VARCHAR(64) NULL COMMENT '关联员工ID', target_type VARCHAR(32) NOT NULL COMMENT '建议对象类型：post/account/employee', target_id VARCHAR(64) NOT NULL COMMENT '建议对象ID', content TEXT NOT NULL COMMENT '建议内容', read_status TINYINT NOT NULL DEFAULT 0 COMMENT '已读状态：0未读 1已读', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_ss_employee_id (employee_id), INDEX idx_ss_target (target_type, target_id), INDEX idx_ss_receiver (receiver_id, read_status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='主管建议表：存储主管给运营的建议（关联账号/作品/员工）'
;

-- 8b. supervisor_suggestions 索引补齐兜底（针对 CREATE TABLE IF NOT EXISTS 跳过的情况）
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_employee_id')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE supervisor_suggestions ADD INDEX idx_ss_employee_id (employee_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_target')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE supervisor_suggestions ADD INDEX idx_ss_target (target_type, target_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supervisor_suggestions' AND INDEX_NAME = 'idx_ss_receiver')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE supervisor_suggestions ADD INDEX idx_ss_receiver (receiver_id, read_status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- ============================================================
-- 9. 索引补齐 (按 schema.sql 期望)
-- 全部走 prepared-statement 模式做幂等。
-- ============================================================

-- 9.1 users 单列索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_role')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE users ADD INDEX idx_users_role (role)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_employee_id')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE users ADD INDEX idx_users_employee_id (employee_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.2 accounts 单列索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND INDEX_NAME = 'idx_accounts_platform')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE accounts ADD INDEX idx_accounts_platform (platform)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND INDEX_NAME = 'idx_accounts_status')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE accounts ADD INDEX idx_accounts_status (status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.3 posts 单列 + 复合索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_posts_platform')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_platform (platform)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_posts_post_type')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_post_type (post_type)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_posts_employee_published')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_employee_published (employee_id, published_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_posts_account_published')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_account_published (account_id, published_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_posts_platform_type_published')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE posts ADD INDEX idx_posts_platform_type_published (platform, post_type, published_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.4 leads 单列 + 复合索引
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_post_id')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_post_id (post_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_platform')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_platform (platform)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_status')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_status (status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_process_status')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_process_status (process_status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_deal_status')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_deal_status (deal_status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_add_status')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_add_status (add_status)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_assigned_sales_user_id')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_assigned_sales_user_id (assigned_sales_user_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_next_follow')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_next_follow (next_follow_time, assigned_sales_user_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_employee_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_employee_created (employee_id, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_sales_process')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_sales_process (assigned_sales_user_id, process_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_status_created (status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_add_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_add_status_created (add_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_process_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_process_status_created (process_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND INDEX_NAME = 'idx_leads_platform_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE leads ADD INDEX idx_leads_platform_created (platform, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.5 lead_follow_records 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_follow_records' AND INDEX_NAME = 'idx_follow_lead_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE lead_follow_records ADD INDEX idx_follow_lead_created (lead_id, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.6 lead_drafts 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_drafts' AND INDEX_NAME = 'idx_drafts_user_type_updated')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE lead_drafts ADD INDEX idx_drafts_user_type_updated (user_id, draft_type, updated_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.7 collaboration_tasks 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collaboration_tasks' AND INDEX_NAME = 'idx_collab_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE collaboration_tasks ADD INDEX idx_collab_status_created (status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.8 orders 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_order_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE orders ADD INDEX idx_orders_order_status_created (order_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_paid_status_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE orders ADD INDEX idx_orders_paid_status_created (paid_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.9 notifications 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notify_receiver_read_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE notifications ADD INDEX idx_notify_receiver_read_created (receiver_id, read_status, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.10 exports 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exports' AND INDEX_NAME = 'idx_exports_user_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE exports ADD INDEX idx_exports_user_created (user_id, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exports' AND INDEX_NAME = 'idx_exports_user_type_created')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE exports ADD INDEX idx_exports_user_type_created (user_id, export_type, created_at)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;

-- 9.11 favorites 复合
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorites' AND INDEX_NAME = 'idx_fav_target')
;
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE favorites ADD INDEX idx_fav_target (target_type, target_id)', 'SELECT 1')
;
PREPARE stmt FROM @ddl
;
EXECUTE stmt
;
DEALLOCATE PREPARE stmt
;
