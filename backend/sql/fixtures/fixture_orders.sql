-- ============================================================
-- B 端 1.2 Fixture: orders 表
-- 编写日期: 2026-06-02
-- 适用: xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 覆盖矩阵:
--   order_status  (7 enum):  to_receive(3) / in_progress(4) /
--                            awaiting_client_info(3) / awaiting_teacher(4) /
--                            to_deliver(4) / completed(5) / abnormal(2)
--                            —— 全部 >= 2
--   paid_status   (3 enum):  unpaid(6) / partial(8) / paid(11) —— 全部 >= 5
--   handover_status(4 varchar): pending(5) / handed_over(5) /
--                               accepted(10) / rejected(5) —— 全部 >= 4
--   service_type  (4):  考研全程班 / 留学申请 / 公考笔试 / 雅思7分突破 轮询
--   amount        (DECIMAL(12,2)): 1100.00 - 9800.00
--   academic_user_id 分布:
--     pending       -> NULL (池单/未分配)
--     handed_over   -> emp-academic-02
--     accepted      -> emp-academic-02
--     rejected      -> emp-academic-02 (拒绝后待重新分配，仍挂旧教务)
-- 依赖:
--   1. schema.sql 已执行（含 orders 表 7 状态 enum + handover_status varchar(16)）
--   2. backend/sql/add-test-users-for-v1.2.sql 已执行（含 emp-academic-02 / academic02 / sales_a / sales_b）
--   3. backend/sql/fixtures/fixture_leads.sql 已执行（提供 lead-test-01 .. lead-test-32，
--      注意实际格式是 2 位零填充，不是任务描述里假设的 3 位；
--      本 fixture 只引用前 25 条 lead-test-01 .. lead-test-25）
-- 重入: 使用 INSERT IGNORE，多次执行安全（主键冲突自动跳过）
-- 回滚: DELETE FROM orders WHERE id LIKE 'order-test-%';
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 25 条测试订单
-- 分布:
--   001-005   pending + academic=NULL（池单）
--   006-010   handed_over + academic=emp-academic-02（已分配/未接受）
--   011-020   accepted + academic=emp-academic-02（已接受/履约中）
--   021-025   rejected + academic=emp-academic-02（已拒收/待重新分配）
-- ============================================================

INSERT IGNORE INTO orders
  (id, lead_id, sales_user_id, academic_user_id, service_type, amount,
   paid_status, order_status, handover_status, remark, created_at, updated_at)
VALUES
  -- ===== §1 池单（pending，academic NULL）=====
  ('order-test-001', 'lead-test-01', 'user-sales-1',  NULL, '考研全程班', 1980.00,
   'unpaid', 'to_receive', 'pending',
   '客户要求 3 个月内完成主课业，对老师风格有要求，倾向年轻老师',
   NOW() - INTERVAL  1 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-002', 'lead-test-02', 'USR_SALES_A',   NULL, '留学申请',   5800.00,
   'unpaid', 'to_receive', 'pending',
   '客户目标英国 G5，需要 PS + 推荐信全套服务，DDL 7/15',
   NOW() - INTERVAL  2 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-003', 'lead-test-03', 'USR_SALES_B',   NULL, '公考笔试',   4500.00,
   'partial','in_progress','pending',
   '客户备战 2026 国考，行测较弱，已收款 50%',
   NOW() - INTERVAL  3 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-004', 'lead-test-04', 'user-sales-1',  NULL, '雅思7分突破', 8800.00,
   'paid',  'in_progress','pending',
   '客户目前 5.5 分，目标 7 分，全款已付，3 个月内完成',
   NOW() - INTERVAL  4 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-005', 'lead-test-05', 'USR_SALES_A',   NULL, '考研全程班', 3200.00,
   'paid',  'awaiting_client_info','pending',
   '客户已付全款，待补充本科成绩单和四级证书',
   NOW() - INTERVAL  5 DAY, NOW() - INTERVAL  2 DAY),

  -- ===== §2 已交接未接受（handed_over，academic=emp-academic-02）=====
  ('order-test-006', 'lead-test-06', 'USR_SALES_B',   'emp-academic-02', '留学申请',   6800.00,
   'unpaid','awaiting_client_info','handed_over',
   '客户首付款待付，已分配教务对接中',
   NOW() - INTERVAL  6 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-007', 'lead-test-07', 'user-sales-1',  'emp-academic-02', '公考笔试',   2400.00,
   'unpaid','awaiting_teacher','handed_over',
   '客户需求紧急，需 48 小时内匹配老师',
   NOW() - INTERVAL  7 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-008', 'lead-test-08', 'USR_SALES_A',   'emp-academic-02', '雅思7分突破', 9800.00,
   'partial','awaiting_teacher','handed_over',
   '客户已付 50%，要求 5.5→7 分 6 个月突破',
   NOW() - INTERVAL  8 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-009', 'lead-test-09', 'USR_SALES_B',   'emp-academic-02', '考研全程班', 5200.00,
   'partial','to_deliver','handed_over',
   '客户已付 60%，待交付全套课程资料',
   NOW() - INTERVAL  9 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-010', 'lead-test-10', 'user-sales-1',  'emp-academic-02', '留学申请',   8500.00,
   'paid',  'to_deliver','handed_over',
   '客户已付全款，PS/RL 终稿已交付',
   NOW() - INTERVAL 10 DAY, NOW() - INTERVAL  1 DAY),

  -- ===== §3 已接受履约中（accepted，academic=emp-academic-02）=====
  ('order-test-011', 'lead-test-11', 'USR_SALES_A',   'emp-academic-02', '公考笔试',   3600.00,
   'paid',  'completed','accepted',
   '客户已通过 2026 国考笔试，全流程结束',
   NOW() - INTERVAL 11 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-012', 'lead-test-12', 'USR_SALES_B',   'emp-academic-02', '雅思7分突破', 7600.00,
   'paid',  'completed','accepted',
   '客户雅思 7.5 达成，已结业',
   NOW() - INTERVAL 12 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-013', 'lead-test-13', 'user-sales-1',  'emp-academic-02', '考研全程班', 4800.00,
   'partial','completed','accepted',
   '客户已上岸 985，尾款待付清',
   NOW() - INTERVAL 13 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-014', 'lead-test-14', 'USR_SALES_A',   'emp-academic-02', '留学申请',   9800.00,
   'paid',  'completed','accepted',
   '客户已获 UCL offer，签证办理中',
   NOW() - INTERVAL 14 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-015', 'lead-test-15', 'USR_SALES_B',   'emp-academic-02', '公考笔试',   4400.00,
   'paid',  'completed','accepted',
   '客户面试第一，已政审',
   NOW() - INTERVAL 15 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-016', 'lead-test-16', 'user-sales-1',  'emp-academic-02', '雅思7分突破', 7200.00,
   'partial','awaiting_client_info','accepted',
   '客户口语较弱，5.0→6.5 阶段，待补口语素材',
   NOW() - INTERVAL 16 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-017', 'lead-test-17', 'USR_SALES_A',   'emp-academic-02', '考研全程班', 3300.00,
   'paid',  'awaiting_teacher','accepted',
   '客户数学薄弱，需匹配数学专项老师',
   NOW() - INTERVAL 17 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-018', 'lead-test-18', 'USR_SALES_B',   'emp-academic-02', '留学申请',   1100.00,
   'unpaid','in_progress','accepted',
   '客户申请文书写中，文书辅导尾款 1100 未付',
   NOW() - INTERVAL 18 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-019', 'lead-test-19', 'user-sales-1',  'emp-academic-02', '公考笔试',   5500.00,
   'partial','in_progress','accepted',
   '客户面试班进行中，已付 50%',
   NOW() - INTERVAL 19 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-020', 'lead-test-20', 'USR_SALES_A',   'emp-academic-02', '雅思7分突破', 6400.00,
   'paid',  'to_deliver','accepted',
   '客户最后阶段课程已结课，待交付结业证书',
   NOW() - INTERVAL 20 DAY, NOW() - INTERVAL  1 DAY),

  -- ===== §4 已拒收待重新分配（rejected，academic 仍指向旧 emp-academic-02）=====
  ('order-test-021', 'lead-test-21', 'USR_SALES_B',   'emp-academic-02', '考研全程班', 4900.00,
   'partial','abnormal','rejected',
   '教务拒收：客户需求超出服务范围，待重新分配',
   NOW() - INTERVAL 21 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-022', 'lead-test-22', 'user-sales-1',  'emp-academic-02', '留学申请',   6700.00,
   'partial','abnormal','rejected',
   '教务拒收：客户时间冲突，待重新分配',
   NOW() - INTERVAL 22 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-023', 'lead-test-23', 'USR_SALES_A',   'emp-academic-02', '公考笔试',   2900.00,
   'unpaid','to_deliver','rejected',
   '教务拒收：客户预算过低，待重新分配',
   NOW() - INTERVAL 23 DAY, NOW() - INTERVAL  3 DAY),

  ('order-test-024', 'lead-test-24', 'USR_SALES_B',   'emp-academic-02', '雅思7分突破', 7800.00,
   'paid',  'awaiting_teacher','rejected',
   '教务拒收：客户要求过高，待重新分配',
   NOW() - INTERVAL 24 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-025', 'lead-test-25', 'user-sales-1',  'emp-academic-02', '考研全程班', 8600.00,
   'paid',  'to_receive','rejected',
   '教务拒收：客户目标院校超出服务能力，待重新分配',
   NOW() - INTERVAL 25 DAY, NOW() - INTERVAL  1 DAY),

  -- ===== §5 已成交 lead 关联订单（E/P1-03：TC-B-040 需要）=====
  -- lead-test-25/26/27/28 状态已是"已成交"，但名下 0 orders。
  -- 新增 4 条订单把它们和订单表关联起来，便于"成交 lead 跨表统计"测试。
  -- 注：lead-test-25 已有 order-test-025 关联（rejected 待重新分配），
  --     本 §5 再补 26/27/28 三条，加 25 自身一条已接受订单 = 4 条。
  ('order-test-026', 'lead-test-25', 'user-sales-1',  'emp-academic-02', '考研全程班', 2380.50,
   'paid',  'completed','accepted',
   '客户已通过 2026 考研初试，全流程结束',
   NOW() - INTERVAL 24 DAY, NOW() - INTERVAL  1 DAY),

  ('order-test-027', 'lead-test-26', 'user-sales-1',  'emp-academic-02', '留学申请',   4580.00,
   'paid',  'completed','accepted',
   '客户已获 LSE offer，签证办理中',
   NOW() - INTERVAL 22 DAY, NOW() - INTERVAL  2 DAY),

  ('order-test-028', 'lead-test-27', 'USR_SALES_A',   'emp-academic-02', '法考全程班', 6800.00,
   'paid',  'completed','accepted',
   '客户已通过 2026 法考客观题，全流程结束',
   NOW() - INTERVAL 23 DAY, NOW() - INTERVAL  3 DAY),

  ('order-test-029', 'lead-test-28', 'USR_SALES_B',   'emp-academic-02', 'CPA 签约班', 3980.00,
   'partial','in_progress','accepted',
   '客户已付 50%，剩余尾款待 6 月底付清',
   NOW() - INTERVAL 25 DAY, NOW() - INTERVAL  4 DAY);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证 SQL（执行后请手动跑以下查询确认）
-- ============================================================

-- 验证 1：总条数 = 25
-- SELECT COUNT(*) AS total FROM orders WHERE id LIKE 'order-test-%';

-- 验证 2：order_status 7 状态分布
-- SELECT order_status, COUNT(*) AS cnt FROM orders
-- WHERE id LIKE 'order-test-%' GROUP BY order_status ORDER BY order_status;

-- 验证 3：paid_status 3 状态分布
-- SELECT paid_status, COUNT(*) AS cnt FROM orders
-- WHERE id LIKE 'order-test-%' GROUP BY paid_status ORDER BY paid_status;

-- 验证 4：handover_status 4 状态分布
-- SELECT handover_status, COUNT(*) AS cnt FROM orders
-- WHERE id LIKE 'order-test-%' GROUP BY handover_status ORDER BY handover_status;

-- 验证 5：academic_user_id 与 handover_status 一致性
-- SELECT handover_status,
--        SUM(CASE WHEN academic_user_id IS NULL THEN 1 ELSE 0 END) AS academic_null,
--        SUM(CASE WHEN academic_user_id = 'emp-academic-02' THEN 1 ELSE 0 END) AS academic_emp
-- FROM orders WHERE id LIKE 'order-test-%' GROUP BY handover_status ORDER BY handover_status;

-- 验证 6：service_type 4 类型分布
-- SELECT service_type, COUNT(*) AS cnt FROM orders
-- WHERE id LIKE 'order-test-%' GROUP BY service_type ORDER BY service_type;

-- 验证 7：amount 范围
-- SELECT MIN(amount) AS min_amt, MAX(amount) AS max_amt, AVG(amount) AS avg_amt
-- FROM orders WHERE id LIKE 'order-test-%';

-- 验证 8：lead_id 引用一致性（前 25 条 leads 全部被引用）
-- SELECT lead_id, COUNT(*) AS cnt FROM orders
-- WHERE id LIKE 'order-test-%' GROUP BY lead_id ORDER BY lead_id;

-- ============================================================
-- 回滚脚本（如需删除本次新增 orders，解除注释后执行）
-- ============================================================

-- DELETE FROM orders WHERE id LIKE 'order-test-%';

-- ============================================================
-- 文档结束
-- ============================================================
