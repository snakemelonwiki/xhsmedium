-- ============================================================
-- 性能优化索引 - 根据第六节稳定性要求添加
-- 目标：30-50人并发时响应时间 <2秒（列表）<3秒（提交）
-- ============================================================

USE lan_dual_role_system;

-- 1. leads 表优化索引（客资查询高频场景）
ALTER TABLE leads ADD INDEX idx_leads_employee_created (employee_id, created_at DESC);
ALTER TABLE leads ADD INDEX idx_leads_sales_process (assigned_sales_user_id, process_status, created_at DESC);
ALTER TABLE leads ADD INDEX idx_leads_next_follow (next_follow_time, assigned_sales_user_id);

-- 2. posts 表优化索引（作品列表高频查询）
ALTER TABLE posts ADD INDEX idx_posts_employee_published (employee_id, published_at DESC, created_at DESC);
ALTER TABLE posts ADD INDEX idx_posts_account_published (account_id, published_at DESC);

-- 3. lead_follow_records 表优化索引（跟进记录查询）
ALTER TABLE lead_follow_records ADD INDEX idx_follow_lead_created (lead_id, created_at DESC);

-- 4. lead_drafts 表优化索引（草稿查询）
ALTER TABLE lead_drafts ADD INDEX idx_drafts_user_type_updated (user_id, draft_type, updated_at DESC);

-- 5. notifications 表优化索引（通知查询）
ALTER TABLE notifications ADD INDEX idx_notify_receiver_read_created (receiver_id, read_status, created_at DESC);

-- 6. post_metrics 表优化索引（指标历史查询）
ALTER TABLE post_metrics ADD INDEX idx_metrics_post_collected (post_id, collected_at DESC);
