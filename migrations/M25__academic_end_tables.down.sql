-- ============================================================
-- M25 down: 回滚教务端表结构扩展
-- 警告：down 仅在开发/演练环境使用，线上回滚必须先备份并评估业务数据丢失
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 删除新表
-- ============================================================
DROP TABLE IF EXISTS order_finance;
DROP TABLE IF EXISTS order_reminders;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS order_submissions;
DROP TABLE IF EXISTS order_authors;
DROP TABLE IF EXISTS teachers;

-- ============================================================
-- 2. 删除 orders 表追加索引
-- ============================================================
DROP INDEX idx_orders_next_follow_at        ON orders;
DROP INDEX idx_orders_next_check_at         ON orders;
DROP INDEX idx_orders_risk_level            ON orders;
DROP INDEX idx_orders_paper_progress        ON orders;
DROP INDEX idx_orders_current_stage         ON orders;
DROP INDEX idx_orders_dispatched_teacher_id ON orders;
DROP INDEX idx_orders_teacher_id            ON orders;

-- ============================================================
-- 3. 回滚 orders 表扩展字段
-- ============================================================
ALTER TABLE orders DROP COLUMN IF EXISTS next_follow_at;
ALTER TABLE orders DROP COLUMN IF EXISTS order_stage;
ALTER TABLE orders DROP COLUMN IF EXISTS risk_level;
ALTER TABLE orders DROP COLUMN IF EXISTS index_review_report;
ALTER TABLE orders DROP COLUMN IF EXISTS indexed_status;
ALTER TABLE orders DROP COLUMN IF EXISTS online_status;
ALTER TABLE orders DROP COLUMN IF EXISTS proof_status;
ALTER TABLE orders DROP COLUMN IF EXISTS page_fee_status;
ALTER TABLE orders DROP COLUMN IF EXISTS revision_status;
ALTER TABLE orders DROP COLUMN IF EXISTS urge_letter_status;
ALTER TABLE orders DROP COLUMN IF EXISTS next_check_at;
ALTER TABLE orders DROP COLUMN IF EXISTS first_week_check_at;
ALTER TABLE orders DROP COLUMN IF EXISTS current_stage;
ALTER TABLE orders DROP COLUMN IF EXISTS paper_progress;
ALTER TABLE orders DROP COLUMN IF EXISTS author_verify_at;
ALTER TABLE orders DROP COLUMN IF EXISTS author_verify_status;
ALTER TABLE orders DROP COLUMN IF EXISTS editor_review_at;
ALTER TABLE orders DROP COLUMN IF EXISTS editor_review_status;
ALTER TABLE orders DROP COLUMN IF EXISTS draft_review_at;
ALTER TABLE orders DROP COLUMN IF EXISTS draft_review_status;
ALTER TABLE orders DROP COLUMN IF EXISTS innovation_review_at;
ALTER TABLE orders DROP COLUMN IF EXISTS innovation_review_status;
ALTER TABLE orders DROP COLUMN IF EXISTS teacher_stability;
ALTER TABLE orders DROP COLUMN IF EXISTS teacher_phone;
ALTER TABLE orders DROP COLUMN IF EXISTS teacher_id;
ALTER TABLE orders DROP COLUMN IF EXISTS dispatched_teacher_id;
ALTER TABLE orders DROP COLUMN IF EXISTS checked_duplicate;
ALTER TABLE orders DROP COLUMN IF EXISTS handover_to_teacher_at;
ALTER TABLE orders DROP COLUMN IF EXISTS registration_status;
ALTER TABLE orders DROP COLUMN IF EXISTS fund_info;
ALTER TABLE orders DROP COLUMN IF EXISTS submit_email_password;
ALTER TABLE orders DROP COLUMN IF EXISTS submit_email;
ALTER TABLE orders DROP COLUMN IF EXISTS article_purpose;
ALTER TABLE orders DROP COLUMN IF EXISTS area;
ALTER TABLE orders DROP COLUMN IF EXISTS major;
ALTER TABLE orders DROP COLUMN IF EXISTS education_level;

-- 恢复 orders 表注释
ALTER TABLE orders COMMENT = '订单表';

SET FOREIGN_KEY_CHECKS = 1;
