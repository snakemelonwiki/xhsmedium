-- ============================================================
-- B 端 1.2 P1 修复 - leads 孤儿数据软删除（D/P1-02）
--
-- 背景：v1.2 数据核查报告 §5.1 指出 leads 表有 1 条
--   lead-23f62cac-9e38-4869-880b-d7f7d6da9d52
--   关联的 account_id / post_id 都已不存在（级联删除时漏掉 lead）。
--
-- 修复策略（按任务文档 D/P1-02）：
--   1) 先跑 SELECT 重新确认孤儿 lead（不写）。
--   2) 软删除：UPDATE leads SET status='invalid' WHERE id = 'XXX'，
--      保留审计，不物理删除。
--
-- 执行：DBA 手动 review 输出后，逐条执行 UPDATE（已用 -- 注释掉待确认）。
-- ============================================================

USE lan_dual_role_system;

-- 1) 重新确认孤儿 lead（v1.2 报告说 1 条）
SELECT '1) leads 孤儿数据 (account/post 已不存在)' AS check_name;
SELECT l.id,
       l.lead_code,
       l.account_id,
       l.post_id,
       l.status,
       l.nickname,
       l.contact_info,
       a.id AS account_exists,
       p.id AS post_exists
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.id
LEFT JOIN posts    p ON l.post_id IS NOT NULL AND p.id = l.post_id
WHERE a.id IS NULL
   OR (l.post_id IS NOT NULL AND p.id IS NULL)
LIMIT 50;

-- 2) 软删除：将孤儿 lead 标记为 status='invalid'
--    需先 review 上面输出，逐条核对，再手动执行：
-- UPDATE leads SET status='invalid' WHERE id='lead-23f62cac-9e38-4869-880b-d7f7d6da9d52';

-- 3) 验证
SELECT '2) 软删除后状态' AS check_name;
SELECT id, lead_code, status
FROM leads
WHERE id='lead-23f62cac-9e38-4869-880b-d7f7d6da9d52';
