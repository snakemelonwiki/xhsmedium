-- ============================================================
-- B 端 1.2 fixture 数据：import_tasks（导入任务）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 实际 DB schema：status 枚举为 pending/processing/completed/failed
-- 4 条数据覆盖全部 4 种状态（spec 仅要求 3 条，含 failed 是为覆盖率）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT IGNORE INTO import_tasks
  (id, import_type, user_id, total_count, success_count, fail_count, status, error_file_url, created_at, finished_at)
VALUES
  -- 1) pending：运营准备导入 5 月份帖子（未启动）
  ('imp-test-001', 'posts', 'youlunrong',
   120, 0, 0, 'pending', NULL,
   '2026-06-01 22:00:00', NULL),

  -- 2) processing：销售正在导入 5 月份客资（已处理一半）
  ('imp-test-002', 'leads', 'user-sales-1',
   200, 120, 0, 'processing', NULL,
   '2026-06-02 07:00:00', NULL),

  -- 3) completed：运营导入帖子成功
  ('imp-test-003', 'posts', 'youlunrong',
   80, 78, 2, 'completed',
   'http://localhost:3000/exports/imp-test-003-errors.csv',
   '2026-05-20 10:00:00', '2026-05-20 10:00:35'),

  -- 4) failed：销售导入客资失败（系统错误）
  ('imp-test-004', 'leads', 'user-sales-1',
   300, 0, 0, 'failed',
   NULL,
   '2026-05-15 11:00:00', '2026-05-15 11:00:08');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证查询（执行后请手动跑以下 4 个查询确认）
-- ============================================================

-- 验证 1：总行数（应 = 4）
-- SELECT COUNT(*) AS total FROM import_tasks WHERE id LIKE 'imp-test-%';

-- 验证 2：import_type 分布（应 posts 与 leads 各 ≥ 1）
-- SELECT import_type, COUNT(*) AS cnt FROM import_tasks WHERE id LIKE 'imp-test-%' GROUP BY import_type ORDER BY import_type;

-- 验证 3：status 分布（应 4 种各 ≥ 1）
-- SELECT status, COUNT(*) AS cnt FROM import_tasks WHERE id LIKE 'imp-test-%' GROUP BY status ORDER BY status;

-- 验证 4：completed 的 finished_at + success_count 必填
-- SELECT id, status, total_count, success_count, finished_at FROM import_tasks WHERE id LIKE 'imp-test-%' AND status = 'completed';

-- 文档结束
-- ============================================================
