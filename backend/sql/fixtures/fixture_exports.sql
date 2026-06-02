-- ============================================================
-- B 端 1.2 fixture 数据：exports（导出任务）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 重要：实际 DB schema 与初版设计稿略有差异，本脚本以 SHOW CREATE TABLE 为准：
--   - 列名 user_id（不是 created_by）
--   - 没有 row_count / file_size / error_message 列
--   - status 枚举为 pending/processing/completed/failed（不是 success）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- §1. posts 导出（运营 youlunrong 为主，admin 兜底）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-001', 'youlunrong', 'posts',
   '{"platform":"小红书","dateRange":"2026-05-01,2026-05-31","status":"published"}',
   'http://localhost:3000/exports/exp-test-001.csv',
   'completed', '2026-05-15 10:00:00', '2026-05-15 10:00:12', '2026-05-15 10:00:12'),
  ('exp-test-002', 'youlunrong', 'posts',
   '{"platform":"抖音","dateRange":"2026-05-01,2026-05-31"}',
   NULL,
   'pending', '2026-06-01 09:30:00', NULL, '2026-06-01 09:30:00'),
  ('exp-test-003', 'youlun', 'posts',
   '{"dateRange":"2026-04-01,2026-04-30","includeDrafts":true}',
   NULL,
   'processing', '2026-06-02 08:00:00', NULL, '2026-06-02 08:00:00'),
  ('exp-test-004', 'youlun', 'posts',
   '{"platform":"小红书","dateRange":"2026-03-01,2026-03-31"}',
   NULL,
   'failed', '2026-05-20 14:00:00', '2026-05-20 14:00:05', '2026-05-20 14:00:05');

-- ============================================================
-- §2. leads 导出（销售 user-sales-1 为主，admin 兜底）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-005', 'user-sales-1', 'leads',
   '{"status":"assigned","platform":"小红书","dateRange":"2026-05-01,2026-05-31"}',
   'http://localhost:3000/exports/exp-test-005.csv',
   'completed', '2026-05-20 09:00:00', '2026-05-20 09:00:18', '2026-05-20 09:00:18'),
  ('exp-test-006', 'user-sales-1', 'leads',
   '{"status":"跟进中","platform":"抖音","dateRange":"2026-05-15,2026-05-31"}',
   NULL,
   'processing', '2026-06-02 07:30:00', NULL, '2026-06-02 07:30:00'),
  ('exp-test-007', 'youlun', 'leads',
   '{"status":"新客资","platform":"小红书","dateRange":"2026-04-01,2026-04-30"}',
   NULL,
   'failed', '2026-04-30 22:00:00', '2026-04-30 22:00:03', '2026-04-30 22:00:03'),
  ('exp-test-008', 'user-sales-1', 'leads',
   '{"status":"已成交","platform":"小红书","dateRange":"2026-05-01,2026-05-31","ownerId":"user-sales-1"}',
   NULL,
   'pending', '2026-06-01 18:00:00', NULL, '2026-06-01 18:00:00');

-- ============================================================
-- §3. rankings 导出（运营/主管）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-009', 'youlunrong', 'rankings',
   '{"metric":"engagementRate","platform":"小红书","dateRange":"2026-05-01,2026-05-31","topN":50}',
   'http://localhost:3000/exports/exp-test-009.csv',
   'completed', '2026-05-31 23:00:00', '2026-05-31 23:00:25', '2026-05-31 23:00:25'),
  ('exp-test-010', 'youlunrong', 'rankings',
   '{"metric":"leadConversion","platform":"抖音","dateRange":"2026-05-01,2026-05-31","topN":100}',
   NULL,
   'pending', '2026-06-01 22:00:00', NULL, '2026-06-01 22:00:00'),
  ('exp-test-011', 'youlun', 'rankings',
   '{"metric":"followerGrowth","platform":"小红书","dateRange":"2026-04-01,2026-04-30"}',
   NULL,
   'failed', '2026-05-01 01:00:00', '2026-05-01 01:00:08', '2026-05-01 01:00:08'),
  ('exp-test-012', 'youlun', 'rankings',
   '{"metric":"postLikes","platform":"抖音","dateRange":"2026-05-01,2026-05-31"}',
   NULL,
   'processing', '2026-06-02 06:00:00', NULL, '2026-06-02 06:00:00');

-- ============================================================
-- §4. orders 导出（销售 user-sales-1 为主，admin 兜底）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-013', 'user-sales-1', 'orders',
   '{"status":"已成交","platform":"小红书","dateRange":"2026-05-01,2026-05-31","ownerId":"user-sales-1"}',
   'http://localhost:3000/exports/exp-test-013.csv',
   'completed', '2026-05-25 11:00:00', '2026-05-25 11:00:20', '2026-05-25 11:00:20'),
  ('exp-test-014', 'youlun', 'orders',
   '{"status":"全部","platform":"全部","dateRange":"2026-04-01,2026-04-30","includeAbnormal":true}',
   NULL,
   'failed', '2026-05-01 03:00:00', '2026-05-01 03:00:05', '2026-05-01 03:00:05'),
  ('exp-test-015', 'user-sales-1', 'orders',
   '{"status":"待跟进","platform":"抖音","dateRange":"2026-05-15,2026-05-31"}',
   NULL,
   'processing', '2026-06-02 09:00:00', NULL, '2026-06-02 09:00:00');

-- ============================================================
-- §5. collaborations 导出（主管 youlun）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-016', 'youlun', 'collaborations',
   '{"status":"已完成","platform":"小红书","dateRange":"2026-04-01,2026-04-30"}',
   NULL,
   'pending', '2026-05-05 10:00:00', NULL, '2026-05-05 10:00:00'),
  ('exp-test-017', 'youlun', 'collaborations',
   '{"status":"全部","platform":"全部","dateRange":"2026-05-01,2026-05-31","includeTimeout":true}',
   NULL,
   'failed', '2026-05-31 23:30:00', '2026-05-31 23:30:04', '2026-05-31 23:30:04'),
  ('exp-test-018', 'youlun', 'collaborations',
   '{"status":"进行中","platform":"小红书","dateRange":"2026-05-01,2026-05-31"}',
   'http://localhost:3000/exports/exp-test-018.csv',
   'completed', '2026-05-30 16:00:00', '2026-05-30 16:00:15', '2026-05-30 16:00:15');

-- ============================================================
-- §6. accounts 导出（运营/主管）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-019', 'youlunrong', 'accounts',
   '{"platform":"小红书","followerRange":"10000-100000","dateRange":"2026-05-01,2026-05-31"}',
   'http://localhost:3000/exports/exp-test-019.csv',
   'completed', '2026-05-28 14:00:00', '2026-05-28 14:00:22', '2026-05-28 14:00:22'),
  ('exp-test-020', 'youlun', 'accounts',
   '{"platform":"抖音","followerRange":"50000+","dateRange":"2026-05-01,2026-05-31"}',
   NULL,
   'pending', '2026-06-01 20:00:00', NULL, '2026-06-01 20:00:00'),
  ('exp-test-021', 'youlun', 'accounts',
   '{"platform":"全部","dateRange":"2026-04-01,2026-04-30"}',
   NULL,
   'processing', '2026-06-02 05:00:00', NULL, '2026-06-02 05:00:00');

-- ============================================================
-- §7. order_progress 导出（教务 user-test-academic-02）
-- ============================================================

INSERT IGNORE INTO exports
  (id, user_id, export_type, filter_json, file_url, status, created_at, finished_at, updated_at)
VALUES
  ('exp-test-022', 'user-test-academic-02', 'order_progress',
   '{"stage":"已开课","dateRange":"2026-05-01,2026-05-31","academicId":"user-test-academic-02"}',
   'http://localhost:3000/exports/exp-test-022.csv',
   'completed', '2026-05-30 17:00:00', '2026-05-30 17:00:14', '2026-05-30 17:00:14'),
  ('exp-test-023', 'user-test-academic-02', 'order_progress',
   '{"stage":"已结课","dateRange":"2026-04-01,2026-04-30"}',
   NULL,
   'failed', '2026-05-01 02:00:00', '2026-05-01 02:00:06', '2026-05-01 02:00:06'),
  ('exp-test-024', 'user-test-academic-02', 'order_progress',
   '{"stage":"待开课","dateRange":"2026-05-15,2026-05-31"}',
   NULL,
   'processing', '2026-06-02 07:00:00', NULL, '2026-06-02 07:00:00');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §8. 验证查询（执行后请手动跑以下 5 个查询确认）
-- ============================================================

-- 验证 1：总行数（应 = 24）
-- SELECT COUNT(*) AS total FROM exports WHERE id LIKE 'exp-test-%';

-- 验证 2：export_type 分布（应 7 种各 ≥ 2 条）
-- SELECT export_type, COUNT(*) AS cnt FROM exports WHERE id LIKE 'exp-test-%' GROUP BY export_type ORDER BY export_type;

-- 验证 3：status 分布（应 4 种各 ≥ 2 条）
-- SELECT status, COUNT(*) AS cnt FROM exports WHERE id LIKE 'exp-test-%' GROUP BY status ORDER BY status;

-- 验证 4：user_id 分布（应至少覆盖 4 个角色）
-- SELECT user_id, COUNT(*) AS cnt FROM exports WHERE id LIKE 'exp-test-%' GROUP BY user_id ORDER BY user_id;

-- 验证 5：completed 状态应都有 file_url
-- SELECT id, file_url FROM exports WHERE id LIKE 'exp-test-%' AND status = 'completed' AND (file_url IS NULL OR file_url = '');

-- 文档结束
-- ============================================================
