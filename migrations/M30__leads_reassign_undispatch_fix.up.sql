-- M30__leads_reassign_undispatch_fix.up.sql
-- v1.3 / SA-12 修复：
--   leads 表中 is_dispatched=1 (已分流) 的客资如果同时有 assigned_sales_user_id，
--   说明历史上已分配给具体销售，但因 is_dispatched 仍为 1，
--   销售端"我的客资"（WHERE is_dispatched=0）始终查不到。
--   修复：把这些记录统一回写为 is_dispatched=0。
--
-- 配套后端改动：backend/src/modules/leads/leads.service.ts:reassignLead
-- 改派时若原 is_dispatched=1，自动翻回 0，保证新一次改派的记录立刻出现在销售端。
--
-- 该脚本幂等，可重复执行。

UPDATE leads
   SET is_dispatched = 0
 WHERE is_dispatched = 1
   AND assigned_sales_user_id IS NOT NULL
   AND assigned_sales_user_id <> '';
