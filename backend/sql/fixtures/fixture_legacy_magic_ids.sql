-- ============================================================
-- B 端 1.2 P1 Fixture F-P1-01：旧 B 端 17 个魔数 ID
-- 编写日期: 2026-06-02
-- 适用: xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 背景: 旧 B 端-详细测试用例.md 引用 LEAD_SALES_A_1..6 / LEAD_SALES_B_1 /
--       LEAD_TMR_1..5 / LEAD_OLD_1 / LEAD_PASSIVE_NEW / ACC_OPS_C_1 /
--       POST_OPS_C_1 / EMP_OPS_C 共 17 个"魔数 ID"，本地 DB 没有这些行，
--       导致 TC-B-040 ~ TC-B-048 等 17 条 fixture 缺失 FAIL。
--       本脚本以 INSERT IGNORE 兜底（已存在则跳过），保证可重入。
--
-- 覆盖实体:
--   1. employees 表:  EMP_OPS_C（EMP 员工行，关联 USR_OPS_C ops_c 账号）
--   2. accounts 表:   ACC_OPS_C_1（小红书账号 1 条，归 ops_c 名下）
--   3. posts 表:      POST_OPS_C_1（作品 1 条，关联 ACC_OPS_C_1 账号）
--   4. leads 表:      14 条
--                    - LEAD_SALES_A_1..6  → assigned_sales_user_id='USR_SALES_A'
--                    - LEAD_SALES_B_1     → assigned_sales_user_id='USR_SALES_B'
--                    - LEAD_TMR_1..5       → assigned_sales_user_id=NULL (team 池单)
--                    - LEAD_OLD_1          → 早期"已成交"历史记录（仅展示，不计入本月）
--                    - LEAD_PASSIVE_NEW    → 被动添加 (add_method='passive')
--
-- 依赖:
--   1. backend/sql/add-test-users-for-v1.2.sql 已执行（含 USR_SALES_A / USR_SALES_B / USR_OPS_C）
--   2. backend/sql/fixtures/fixture_leads.sql / fixture_orders.sql / fixture_notifications.sql 等已执行
--
-- 重入: 使用 INSERT IGNORE 多次执行安全（主键冲突自动跳过）
-- 回滚: DELETE FROM leads WHERE id LIKE 'LEAD_SALES_A_%' OR id LIKE 'LEAD_SALES_B_%'
--                       OR id LIKE 'LEAD_TMR_%' OR id = 'LEAD_OLD_1'
--                       OR id = 'LEAD_PASSIVE_NEW';
--       DELETE FROM posts WHERE id = 'POST_OPS_C_1';
--       DELETE FROM accounts WHERE id = 'ACC_OPS_C_1';
--       DELETE FROM employees WHERE id = 'EMP_OPS_C';
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- §1. 员工：EMP_OPS_C（关联 ops_c 账号，v1.2 fixture 缺失）
-- ============================================================
INSERT IGNORE INTO employees
  (id, employee_code, name, phone, hire_date, status, created_at, updated_at)
VALUES
  ('EMP_OPS_C', 'EMP0010', '何运营', '13800000010', '2026-04-15', '在职',
   NOW() - INTERVAL 90 DAY, NOW());

-- ============================================================
-- §2. 账号：ACC_OPS_C_1（小红书，归 EMP_OPS_C 名下）
-- 注：accounts 表主键为 varchar(64) UUID。'ACC_OPS_C_1' 是非 UUID 风格的魔数 ID，
--     在 v1.2 schema 下会通过；旧 B 端脚本引用的就是这种 ID。Schema 未限定 UUID 格式。
-- ============================================================
INSERT IGNORE INTO accounts
  (id, employee_id, platform, profile_url, account_name, account_uid,
   persona, positioning, posting_plan, status, created_at, updated_at)
VALUES
  ('ACC_OPS_C_1', 'EMP_OPS_C', '小红书',
   'https://www.xiaohongshu.com/user/profile/ops_c_001',
   '何运营笔记', 'ops_c_xhs_001', '亲切学姐', '考研陪伴',
   '每周 3 篇学习方法论 + 1 篇上岸经验', '正常',
   NOW() - INTERVAL 80 DAY, NOW() - INTERVAL  1 DAY);

-- ============================================================
-- §3. 作品：POST_OPS_C_1（关联 ACC_OPS_C_1）
-- ============================================================
INSERT IGNORE INTO posts
  (id, employee_id, account_id, platform, title, copywriting,
   cover_image_url, cover_thumb_url, post_url, post_type,
   traffic, likes, comments, favorites, shares,
   metrics_updated_at, published_at, note, supervisor_suggestion,
   created_at, updated_at)
VALUES
  ('POST_OPS_C_1', 'EMP_OPS_C', 'ACC_OPS_C_1', '小红书',
   '考研英语二阅读理解 4 步解题法', '今天分享一个我自己用了 3 年的阅读 4 步法...',
   'https://example.com/uploads/covers/post_ops_c_1.png',
   'https://example.com/uploads/covers/post_ops_c_1_thumb.png',
   'https://www.xiaohongshu.com/explore/post_ops_c_1',
   '图文',
   18600, 1230, 89, 245, 67,
   NOW() - INTERVAL 2 DAY, CURDATE() - INTERVAL 5,
   '封面改版后第 2 周，阅读完成率提升 18%',
   '建议在评论区主动提问，引导留资',
   NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 1 DAY);

-- ============================================================
-- §4. 客资：14 条魔数 ID
-- 命名约定:
--   LEAD_SALES_A_1..6   销售 A 名下（USR_SALES_A）
--   LEAD_SALES_B_1      销售 B 名下（USR_SALES_B）
--   LEAD_TMR_1..5       team 池单 / 未分配（销售成员池，assigned=NULL）
--   LEAD_OLD_1          旧"已成交"历史记录（用于 TC 跨月统计兼容）
--   LEAD_PASSIVE_NEW    被动添加 (add_method='passive')，未分配销售
-- ============================================================
INSERT IGNORE INTO leads
  (id, employee_id, account_id, post_id, platform, contact_info, nickname,
   budget, major_content, ip, status, deal_amount, note, capture_image_url,
   sales_feedback, sales_updated_at, sales_user_name,
   assigned_sales_user_id, assigned_sales_user_name,
   process_status, add_status, intention, lead_code,
   intention_level, add_method, next_follow_time, matched_post_id,
   source_unknown, created_at, updated_at)
VALUES
  -- §4.1 销售 A 名下 6 条：覆盖 6 种 process_status
  ('LEAD_SALES_A_1', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A01', 'A客户-001', '3000-5000', '计算机科学与技术', '北京', '已分配', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '未联系', '已申请', '考研', 'LCSAA0001', 'pending', 'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 10 DAY),
  ('LEAD_SALES_A_2', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A02', 'A客户-002', '5000-8000', '金融学',           '上海', '已分配', NULL, '已分配至销售跟进',     NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '待通过', '已申请', 'CPA',  'LCSAA0002', 'pending', 'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL 12 DAY, NOW() - INTERVAL  9 DAY),
  ('LEAD_SALES_A_3', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A03', 'A客户-003', '3000-5000', '新闻传播',         '广州', '跟进中', NULL, '已沟通报价',           NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '已报价', '已添加', '考研', 'LCSAA0003', 'mid',     'active',  NOW() + INTERVAL 1 DAY, 'POST_OPS_C_1',  0, NOW() - INTERVAL 15 DAY, NOW() - INTERVAL  3 DAY),
  ('LEAD_SALES_A_4', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A04', 'A客户-004', '8000-12000','工商管理',         '深圳', '跟进中', NULL, '客户已表达明确意向',   NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '沟通中', '已添加', '留学', 'LCSAA0004', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'POST_OPS_C_1',  0, NOW() - INTERVAL 18 DAY, NOW() - INTERVAL  2 DAY),
  ('LEAD_SALES_A_5', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A05', 'A客户-005', '3000-5000', '教育学',           '杭州', '已成交', 3880.00, '客户已付款，课程已开通', NULL,                                                '已确认报名，尾款已付清',                  NOW() - INTERVAL 1 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '已成交', '已添加', '教师资格证', 'LCSAA0005', 'high',    'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL 25 DAY, NOW() - INTERVAL  1 DAY),
  ('LEAD_SALES_A_6', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000A06', 'A客户-006', '5000-8000', '心理学',           '北京', '已成交', 5680.00, '客户已付款，课程已开通', NULL,                                                '已确认报名，材料已收齐',                  NOW() - INTERVAL 2 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '已成交', '已添加', '心理学考研','LCSAA0006', 'high',    'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL 28 DAY, NOW() - INTERVAL  2 DAY),

  -- §4.2 销售 B 名下 1 条：覆盖"已分配 + 待通过"分支
  ('LEAD_SALES_B_1', 'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000B01', 'B客户-001', '5000-8000', '会计学',           '上海', '已分配', NULL, '已分配至销售跟进',     NULL,                     NULL,                                       NULL,        'sales_b',    'USR_SALES_B',          'sales_b',                '待通过', '已申请', 'CPA',  'LCSAB0001', 'pending', 'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL  8 DAY, NOW() - INTERVAL  6 DAY),

  -- §4.3 Team 池单 5 条（assigned=NULL，用于"销售 A 集中越权"测试基线）
  ('LEAD_TMR_1',     'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000T01', 'TMR客户-001', '3000-5000', '计算机科学与技术', '北京', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', '考研', 'LCTMR0001', 'pending', 'unknown', NULL,                  NULL,            1, NOW() - INTERVAL  3 DAY, NOW() - INTERVAL  3 DAY),
  ('LEAD_TMR_2',     'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000T02', 'TMR客户-002', '5000-8000', '金融学',           '上海', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', 'CPA',  'LCTMR0002', 'pending', 'unknown', NULL,                  NULL,            1, NOW() - INTERVAL  4 DAY, NOW() - INTERVAL  4 DAY),
  ('LEAD_TMR_3',     'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000T03', 'TMR客户-003', '3000-5000', '新闻传播',         '广州', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', '新传考研','LCTMR0003', 'pending', 'unknown', NULL,                  NULL,         1, NOW() - INTERVAL  5 DAY, NOW() - INTERVAL  5 DAY),
  ('LEAD_TMR_4',     'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000T04', 'TMR客户-004', '5000-8000', '教育学',           '深圳', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', '教师资格证','LCTMR0004', 'pending', 'unknown', NULL,                  NULL,         1, NOW() - INTERVAL  6 DAY, NOW() - INTERVAL  6 DAY),
  ('LEAD_TMR_5',     'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000T05', 'TMR客户-005', '8000-12000','工商管理',         '杭州', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', 'MBA',  'LCTMR0005', 'pending', 'unknown', NULL,                  NULL,            1, NOW() - INTERVAL  7 DAY, NOW() - INTERVAL  7 DAY),

  -- §4.4 旧成交历史 1 条（用于跨月统计兼容，created_at 远在过去）
  ('LEAD_OLD_1',      'EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000OLD', 'OLD客户-001', '3000-5000', '计算机科学与技术', '北京', '已成交', 2980.00, '客户已付款，课程已开通', NULL,                                                '历史成交，本月不计入',                            NOW() - INTERVAL  3 DAY, 'sales01',    'user-sales-1',         'sales01',                '已成交', '已添加', '考研', 'LCOLD0001', 'high',    'active',  NULL,                  'POST_OPS_C_1',  0, NOW() - INTERVAL 120 DAY, NOW() - INTERVAL 60 DAY),

  -- §4.5 被动添加 1 条（add_method='passive'，用于被动添加流程测试）
  ('LEAD_PASSIVE_NEW','EMP_OPS_C', 'ACC_OPS_C_1', 'POST_OPS_C_1', '小红书', '13900000PN1', 'PN客户-001', '3000-5000', '计算机科学与技术', '北京', '新客资', NULL, '被动添加，待销售认领', NULL,                     NULL,                                       NULL,        NULL,         NULL,                   NULL,                   '未联系', '未添加', '考研', 'LCPN0001',  'pending', 'passive', NULL,                  NULL,            0, NOW() - INTERVAL  1 DAY, NOW() - INTERVAL  1 DAY);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §5. 验证查询（执行后请手动跑以下 4 个查询确认覆盖）
-- ============================================================

-- 验证 1：14 条 lead 魔数 ID 全部就位
-- SELECT COUNT(*) AS total FROM leads
-- WHERE id IN (
--   'LEAD_SALES_A_1','LEAD_SALES_A_2','LEAD_SALES_A_3','LEAD_SALES_A_4','LEAD_SALES_A_5','LEAD_SALES_A_6',
--   'LEAD_SALES_B_1',
--   'LEAD_TMR_1','LEAD_TMR_2','LEAD_TMR_3','LEAD_TMR_4','LEAD_TMR_5',
--   'LEAD_OLD_1','LEAD_PASSIVE_NEW'
-- );

-- 验证 2：3 个非 lead 魔数 ID（account / post / employee）
-- SELECT id FROM accounts WHERE id = 'ACC_OPS_C_1';
-- SELECT id FROM posts WHERE id = 'POST_OPS_C_1';
-- SELECT id FROM employees WHERE id = 'EMP_OPS_C';

-- 验证 3：销售 A 6 条 / 销售 B 1 条 / TMR 5 条 / OLD 1 / PASSIVE 1
-- SELECT assigned_sales_user_id, COUNT(*) AS cnt FROM leads
-- WHERE id LIKE 'LEAD_SALES_A_%' OR id LIKE 'LEAD_SALES_B_%'
--    OR id LIKE 'LEAD_TMR_%' OR id = 'LEAD_OLD_1' OR id = 'LEAD_PASSIVE_NEW'
-- GROUP BY assigned_sales_user_id ORDER BY assigned_sales_user_id;

-- ============================================================
-- 文档结束
-- ============================================================
