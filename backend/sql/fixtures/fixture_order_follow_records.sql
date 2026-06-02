-- ============================================================
-- B 端 1.2 Fixture: order_follow_records 表
-- 编写日期: 2026-06-02
-- 适用: xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 覆盖矩阵:
--   node_type (6):  沟通 / 资料收集 / 老师安排 / 节点完成 / 交付动作 / 异常反馈 —— 全部 >= 1
--   next_remind_at 分布 (12 条):
--     NULL                   (1 条)  无提醒
--     NOW() + INTERVAL 1 HOUR  (5 条) 即将到期，扫描器未发
--     NOW() - INTERVAL 1 HOUR  (3 条) 已过期，扫描器待发送（reminder_sent_at = NULL）
--     NOW() + INTERVAL 7 DAY   (2 条) 远期
--   reminder_sent_at 分布:
--     NULL                    (11 条) 未发送
--     NOW() - INTERVAL 3 HOUR  (1 条)  已发过（幂等性测试：扫描器不应重发）
--   user_id 分布:
--     user-test-academic-02 (10 条) 教务记录
--     user-sales-1          (3 条)  销售记录（节点完成 + 沟通）
-- 依赖:
--   1. schema.sql 已执行（含 reminder_sent_at v1.2 幂等字段）
--   2. backend/sql/add-test-users-for-v1.2.sql 已执行（含 user-test-academic-02 / user-sales-1）
--   3. backend/sql/fixtures/fixture_orders.sql 已执行（提供 order-test-001 .. order-test-010）
--   注: order_id 全部引用 fixture_orders.sql 中前 10 条订单（001-010），
--       保证 referential integrity（逻辑外键，本表无 FK 约束）。
-- 重入: 使用 INSERT IGNORE，多次执行安全（主键冲突自动跳过）
-- 回滚: DELETE FROM order_follow_records WHERE id LIKE 'ofr-test-%';
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 12 条测试跟进记录
-- 分布:
--   001-005   关联 order-test-001 ~ 005（池单 / 已交接）
--   006-010   关联 order-test-006 ~ 010（已交接 + 部分已接受）
--   011-012   关联 order-test-008 / 010（补充：老师安排 + 已发送提醒）
-- ============================================================

INSERT IGNORE INTO order_follow_records
  (id, order_id, user_id, node_type, content,
   next_remind_at, reminder_sent_at, created_at)
VALUES
  -- ===== §1 池单 + 已交接订单的跟进记录（关联 order-test-001 ~ 005）=====
  ('ofr-test-001', 'order-test-001', 'user-test-academic-02', '沟通',
   '已与客户微信沟通，客户对服务整体满意，确认 7 月开始主课业学习。',
   NULL, NULL, NOW() - INTERVAL  6 HOUR),

  ('ofr-test-002', 'order-test-002', 'user-test-academic-02', '资料收集',
   '已发送资料收集清单给客户，包括本科成绩单、获奖证书、英语成绩单。',
   NOW() + INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  5 HOUR),

  ('ofr-test-003', 'order-test-003', 'user-test-academic-02', '老师安排',
   '客户倾向年轻老师，要求 985 院校背景，目前匹配中：候选 1 王老师、候选 2 李老师。',
   NOW() - INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  4 HOUR),

  ('ofr-test-004', 'order-test-004', 'user-sales-1', '节点完成',
   '首课测试已完成，客户模考成绩 65/100，诊断报告显示写作较弱。',
   NOW() + INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  3 HOUR),

  ('ofr-test-005', 'order-test-005', 'user-test-academic-02', '交付动作',
   '已为客户寄出全套纸质讲义和模拟题库，含 5 套真题+3 套模拟+配套解析。',
   NOW() + INTERVAL 7 DAY, NULL, NOW() - INTERVAL  2 HOUR),

  -- ===== §2 已交接订单的跟进记录（关联 order-test-006 ~ 010）=====
  ('ofr-test-006', 'order-test-006', 'user-test-academic-02', '异常反馈',
   '客户反馈某节网课视频卡顿，已联系技术部排查，并提供备用下载链接。',
   NOW() + INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  4 HOUR),

  ('ofr-test-007', 'order-test-007', 'user-test-academic-02', '沟通',
   '今日 14:30 与客户电话沟通，调整上课时间为工作日晚上 19:00-21:00。',
   NOW() - INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  5 HOUR),

  ('ofr-test-008', 'order-test-008', 'user-test-academic-02', '资料收集',
   '客户已补充实习证明扫描件和导师推荐信初稿，剩余 1 份 PS 待完成。',
   NOW() + INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  3 HOUR),

  ('ofr-test-009', 'order-test-009', 'user-sales-1', '节点完成',
   '本周完成第 3 阶段全部课程，客户出勤率 95%，作业提交率 100%。',
   NOW() - INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  6 HOUR),

  ('ofr-test-010', 'order-test-010', 'user-test-academic-02', '交付动作',
   '雅思 7 分突破班全部课程已交付，附完整录播回放链接和讲义 PDF。',
   NOW() + INTERVAL 7 DAY, NULL, NOW() - INTERVAL  2 HOUR),

  -- ===== §3 补充记录：增加 node_type 覆盖 + 已发送提醒幂等场景 =====
  ('ofr-test-011', 'order-test-008', 'user-test-academic-02', '老师安排',
   '王老师已被客户选定，已锁定周一/三/五 19:00-21:00 共 12 次课。',
   NOW() + INTERVAL 1 HOUR, NULL, NOW() - INTERVAL  1 HOUR),

  ('ofr-test-012', 'order-test-008', 'user-test-academic-02', '沟通',
   '客户确认 6 月 15 日参加模拟面试，已发送面试注意事项清单。',
   NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 3 HOUR, NOW() - INTERVAL  4 HOUR),

  -- ===== §4 销售角色记录补强（E/P1-02：原 2 条 → 3 条）=====
  -- 新增 1 条 sales-1 角色记录，node_type=沟通，覆盖"销售自己跟单"路径。
  ('ofr-test-013', 'order-test-007', 'user-sales-1', '沟通',
   '销售 sales01 与客户在微信上确认本周上课时间，并核对到课安排。',
   NOW() + INTERVAL 2 HOUR, NULL, NOW() - INTERVAL  30 MINUTE);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证 SQL（执行后请手动跑以下查询确认）
-- ============================================================

-- 验证 1：总条数 >= 10
-- SELECT COUNT(*) AS total FROM order_follow_records WHERE id LIKE 'ofr-test-%';

-- 验证 2：6 个 node_type 全覆盖
-- SELECT node_type, COUNT(*) AS cnt FROM order_follow_records
-- WHERE id LIKE 'ofr-test-%' GROUP BY node_type ORDER BY node_type;

-- 验证 3：next_remind_at 分布（3 桶 + NULL）
-- SELECT
--   SUM(CASE WHEN next_remind_at IS NULL                                          THEN 1 ELSE 0 END) AS no_remind,
--   SUM(CASE WHEN next_remind_at BETWEEN NOW() AND NOW() + INTERVAL 2 HOUR       THEN 1 ELSE 0 END) AS upcoming_1h,
--   SUM(CASE WHEN next_remind_at <  NOW() AND reminder_sent_at IS NULL           THEN 1 ELSE 0 END) AS overdue_pending,
--   SUM(CASE WHEN next_remind_at <  NOW() AND reminder_sent_at IS NOT NULL       THEN 1 ELSE 0 END) AS overdue_sent,
--   SUM(CASE WHEN next_remind_at >  NOW() + INTERVAL 1 DAY                       THEN 1 ELSE 0 END) AS far_future
-- FROM order_follow_records WHERE id LIKE 'ofr-test-%';

-- 验证 4：reminder_sent_at 分布
-- SELECT
--   SUM(CASE WHEN reminder_sent_at IS NULL     THEN 1 ELSE 0 END) AS unsent,
--   SUM(CASE WHEN reminder_sent_at IS NOT NULL THEN 1 ELSE 0 END) AS sent
-- FROM order_follow_records WHERE id LIKE 'ofr-test-%';

-- 验证 5：user_id 分布
-- SELECT user_id, COUNT(*) AS cnt FROM order_follow_records
-- WHERE id LIKE 'ofr-test-%' GROUP BY user_id ORDER BY user_id;

-- 验证 6：order_id 引用一致性（仅引用 fixture_orders.sql 中前 10 条订单）
-- SELECT order_id, COUNT(*) AS cnt FROM order_follow_records
-- WHERE id LIKE 'ofr-test-%' GROUP BY order_id ORDER BY order_id;

-- 验证 7：order_id 必须在 orders 表存在
-- SELECT ofr.order_id
-- FROM order_follow_records ofr
-- LEFT JOIN orders o ON o.id = ofr.order_id
-- WHERE ofr.id LIKE 'ofr-test-%' AND o.id IS NULL;
-- 预期: 空结果

-- ============================================================
-- 回滚脚本（如需删除本次新增 follow records，解除注释后执行）
-- ============================================================

-- DELETE FROM order_follow_records WHERE id LIKE 'ofr-test-%';

-- ============================================================
-- 文档结束
-- ============================================================
