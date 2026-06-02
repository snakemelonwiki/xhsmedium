-- ============================================================
-- B 端 1.2 fixture 数据：favorites（收藏夹）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 覆盖 2 种 target_type（post / account） × 你lunrong
-- target_id 全部使用真实存在的 posts/accounts ID（已 SELECT 验证）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT IGNORE INTO favorites
  (id, user_id, target_type, target_id, created_at)
VALUES
  -- 帖子收藏（3 条）
  ('fav-test-001', 'youlunrong', 'post', 'post-02173f96-d7f5-4340-84f4-27da3be5c997',
   '2026-05-20 10:30:00'),
  ('fav-test-002', 'youlunrong', 'post', 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb',
   '2026-05-22 11:00:00'),
  ('fav-test-003', 'youlunrong', 'post', 'post-1c860ad6-16d1-45f0-a397-9c2f8d288e7a',
   '2026-05-25 14:30:00'),

  -- 账号收藏（2 条）
  ('fav-test-004', 'youlunrong', 'account', 'acc-03cb71b8-7729-41e2-9885-11257fa95359',
   '2026-05-18 09:00:00'),
  ('fav-test-005', 'youlunrong', 'account', 'acc-06348c31-db6f-4b7b-afd7-b8f48486ce30',
   '2026-05-19 09:30:00');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证查询（执行后请手动跑以下 3 个查询确认）
-- ============================================================

-- 验证 1：总行数（应 = 5）
-- SELECT COUNT(*) AS total FROM favorites WHERE id LIKE 'fav-test-%';

-- 验证 2：target_type 分布（应 post 与 account 各 ≥ 1）
-- SELECT target_type, COUNT(*) AS cnt FROM favorites WHERE id LIKE 'fav-test-%' GROUP BY target_type ORDER BY target_type;

-- 验证 3：target_id 关联的 posts/accounts 应真实存在
-- SELECT f.id, f.target_type, f.target_id,
--        (SELECT COUNT(*) FROM posts    WHERE id = f.target_id) AS post_hit,
--        (SELECT COUNT(*) FROM accounts WHERE id = f.target_id) AS acc_hit
--   FROM favorites f WHERE f.id LIKE 'fav-test-%' ORDER BY f.id;

-- 文档结束
-- ============================================================
