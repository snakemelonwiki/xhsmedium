-- M30__leads_reassign_undispatch_fix.down.sql
-- 回滚：把 is_dispatched=0 且有 assigned_sales_user_id 的记录回写为 1。
-- ⚠️ 这会把所有已分流的销售端客资标记回 1，导致"我的客资"再次空数据；
--   仅在调试时使用，不应在生产回滚。

UPDATE leads
   SET is_dispatched = 1
 WHERE is_dispatched = 0
   AND assigned_sales_user_id IS NOT NULL
   AND assigned_sales_user_id <> '';
