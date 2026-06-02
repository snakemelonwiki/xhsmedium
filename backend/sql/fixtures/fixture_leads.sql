-- ============================================================
-- B 端 1.2 fixture 数据：leads（销售线索 / 客资）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 重要：本脚本以 SHOW COLUMNS FROM leads 为准
--   - id 主键为 varchar(64) UUID 风格
--   - status 已扩展为 8 个值（业务需求 B 端 1.2）
--   - add_status / process_status 为流程状态机
--   - intention_level / add_method 为分类标签
--   - source_unknown = 1 表示被动添加来源待确认
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- §1. 新客资（5 条，assigned_sales_user_id = NULL）
-- 覆盖矩阵：
--   status=新客资 / add_status=未添加 / process_status=未联系
--   intention_level=pending / add_method=unknown / source_unknown=1
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
  ('lead-test-01', 'emp-bd0c8410-1358-4e15-b164-ff7aeff9f84a', 'acc-b4cf3232-024e-4a24-9c80-fc4587e68c2f', 'post-d0d1c3db-012a-47c4-a2cf-24a1dac429e0', '抖音',   '13800000001', '李同学', '3000-5000',  '计算机科学与技术', '北京', '新客资', NULL, '系统自动入库',          NULL,                     NULL,                                       NULL,        NULL,          NULL,                  NULL,                  '未联系', '未添加', '考研', 'LC20260001', 'pending', 'unknown', NULL,                  NULL,                                       1, NOW() - INTERVAL 5  DAY, NOW() - INTERVAL 5  DAY),
  ('lead-test-02', 'emp-3d64d870-862a-4947-8134-b92e4f75a01c', 'acc-2dacb055-b505-49a5-9c44-0f278026901e', 'post-d19b14d3-4701-48b3-a82c-928e6b0077b1', '小红书', '13800000002', '王同学', '5000-8000',  '工商管理',         '上海', '新客资', NULL, '小红书评论引流',        'https://example.com/uploads/captures/lead_2.png', NULL,                                       NULL,        NULL,          NULL,                  NULL,                  '未联系', '未添加', '留学', 'LC20260002', 'pending', 'unknown', NULL,                  'post-d19b14d3-4701-48b3-a82c-928e6b0077b1',  1, NOW() - INTERVAL 8  DAY, NOW() - INTERVAL 8  DAY),
  ('lead-test-03', 'emp-951c7ae5-8939-48a2-8085-057e00b90e33', 'acc-7f1cfee5-e6a7-4601-8ba9-e2d86fc143fe', 'post-caa250f3-f973-4a3b-9224-0de99c92438d', '抖音',   '13800000003', '张同学', '2000-3000',  '法学',             '广州', '新客资', NULL, '抖音私信咨询',          NULL,                     NULL,                                       NULL,        NULL,          NULL,                  NULL,                  '未联系', '未添加', '公考', 'LC20260003', 'pending', 'unknown', NULL,                  NULL,                                       1, NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 12 DAY),
  ('lead-test-04', 'emp-3caf91e6-cc76-4699-9df5-b0f43312e2d9', 'acc-8c3f9d2f-75b4-433e-ac74-4e6694dc551e', 'post-506dcdf9-eae1-4e1a-bdc7-cb10d4916612', '小红书', '13800000004', '刘同学', '4000-6000',  '金融学',           '深圳', '新客资', NULL, '主页评论区引流',        'https://example.com/uploads/captures/lead_4.png', NULL,                                       NULL,        NULL,          NULL,                  NULL,                  '未联系', '未添加', '考研', 'LC20260004', 'pending', 'unknown', NULL,                  'post-506dcdf9-eae1-4e1a-bdc7-cb10d4916612',  1, NOW() - INTERVAL 15 DAY, NOW() - INTERVAL 14 DAY),
  ('lead-test-05', 'emp-e31b183c-6096-41ce-8bde-ff8dc1b0f64e', 'acc-c9058951-bb9a-4b95-8801-7f9c780147cd', 'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e', '抖音',   '13800000005', '陈同学', '3000-5000',  '教育学',           '杭州', '新客资', NULL, NULL,                       NULL,                     NULL,                                       NULL,        NULL,          NULL,                  NULL,                  '未联系', '未添加', '留学', 'LC20260005', 'pending', 'unknown', NULL,                  NULL,                                       1, NOW() - INTERVAL 18 DAY, NOW() - INTERVAL 18 DAY);

-- ============================================================
-- §2. 已分配（3 条，sales01 x 2 + sales_a x 1）
-- 覆盖矩阵：
--   status=已分配 / add_status=已申请 / process_status=待通过
--   intention_level=pending / add_method=active / source_unknown=1
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
  ('lead-test-06', 'emp-535645b4-0970-41aa-a1b7-41551d99d518', 'acc-a8fedd87-ae9c-469f-a528-9be19b43e775', 'post-a688b81a-1978-4977-a447-485226c5615f', '小红书', '13800000006', '杨同学', '5000-8000',  '心理学',           '北京', '已分配', NULL, '已分配至销售跟进',     NULL,                     NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '待通过', '已申请', '法考', 'LC20260006', 'pending', 'active',  NULL,                  'post-a688b81a-1978-4977-a447-485226c5615f',  1, NOW() - INTERVAL 6  DAY, NOW() - INTERVAL 4  DAY),
  ('lead-test-07', 'emp-337c3321-7773-4d33-864c-8797572ab623', 'acc-136afd7d-f8c3-4b13-8ab9-e10aa8ed1800', 'post-281e5c21-aaf2-462f-918b-b5e49477ae0e', '抖音',   '13800000007', '黄同学', '8000-12000', '会计学',           '上海', '已分配', NULL, '已分配至销售跟进',     NULL,                     NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '待通过', '已申请', 'CPA',  'LC20260007', 'pending', 'active',  NULL,                  NULL,                                       1, NOW() - INTERVAL 9  DAY, NOW() - INTERVAL 7  DAY),
  ('lead-test-08', 'emp-292b122a-c487-4b39-a768-9cb44ce37ffc', 'acc-1eb0c2f6-cbcb-4654-938f-0666c222f8b0', 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb', '小红书', '13800000008', '周同学', '3000-5000',  '新闻传播',         '广州', '已分配', NULL, '已分配至销售跟进',     NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '待通过', '已申请', '雅思', 'LC20260008', 'pending', 'active',  NULL,                  'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb',  1, NOW() - INTERVAL 11 DAY, NOW() - INTERVAL 9  DAY);

-- ============================================================
-- §2b. 已分配-未通过（3 条，sales01 x 2 + sales_a x 1）
-- 覆盖矩阵：add_status=未通过 补充覆盖
--   status=已分配 / add_status=未通过 / process_status=待通过
--   intention_level=pending / add_method=active / source_unknown=1
--   （semantic: 已发送好友申请但未通过，状态回流）
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
  ('lead-test-33', 'emp-academic-02',                          'acc-2dacb055-b505-49a5-9c44-0f278026901e', 'post-d19b14d3-4701-48b3-a82c-928e6b0077b1', '小红书', '13800000033', '潘同学', '3000-5000',  '计算机科学与技术', '北京', '已分配', NULL, '好友申请未通过',       NULL,                     NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '待通过', '未通过', '考研', 'LC20260033', 'pending', 'active',  NULL,                  'post-d19b14d3-4701-48b3-a82c-928e6b0077b1',  1, NOW() - INTERVAL 7  DAY, NOW() - INTERVAL 5  DAY),
  ('lead-test-34', 'emp-bd0c8410-1358-4e15-b164-ff7aeff9f84a', 'acc-b4cf3232-024e-4a24-9c80-fc4587e68c2f', 'post-d0d1c3db-012a-47c4-a2cf-24a1dac429e0', '抖音',   '13800000034', '钱同学', '5000-8000',  '工商管理',         '上海', '已分配', NULL, '好友申请未通过',       'https://example.com/uploads/captures/lead_34.png', NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '待通过', '未通过', '留学', 'LC20260034', 'pending', 'active',  NULL,                  NULL,                                       1, NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 6  DAY),
  ('lead-test-35', 'emp-3d64d870-862a-4947-8134-b92e4f75a01c', 'acc-2dacb055-b505-49a5-9c44-0f278026901e', 'post-d19b14d3-4701-48b3-a82c-928e6b0077b1', '小红书', '13800000035', '苏同学', '8000-12000', '法学',             '广州', '已分配', NULL, '好友申请未通过',       NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '待通过', '未通过', '法考', 'LC20260035', 'pending', 'active',  NULL,                  'post-d19b14d3-4701-48b3-a82c-928e6b0077b1',  1, NOW() - INTERVAL 13 DAY, NOW() - INTERVAL 8  DAY);

-- ============================================================
-- §3. 跟进中（5 条，sales01 x 3 + sales_a x 1 + sales_b x 1）
-- 覆盖矩阵：
--   status=跟进中 / add_status=运营已提醒
--   process_status=沟通中(3) + 已报价(2)
--   intention_level=high / add_method=active
--   source_unknown=1(2) + 0(3)
--   含 next_follow_time = NOW() + 1 DAY + sales_feedback
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
  ('lead-test-09', 'emp-bd0c8410-1358-4e15-b164-ff7aeff9f84a', 'acc-181ee5b9-9f4c-495e-b647-f97d12f494a5', 'post-02173f96-d7f5-4340-84f4-27da3be5c997', '抖音',   '13800000009', '吴同学', '3000-5000',  '计算机科学与技术', '深圳', '跟进中', NULL, '客户已表达明确意向',   'https://example.com/uploads/captures/lead_9.png',  '客户咨询考研课程, 关注价格与课程时长, 建议持续跟进',     NOW() - INTERVAL 2 DAY, 'sales01',    'user-sales-1',         'sales01',                '沟通中', '运营已提醒', '考研', 'LC20260009', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-02173f96-d7f5-4340-84f4-27da3be5c997',  1, NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 2  DAY),
  ('lead-test-10', 'emp-3d64d870-862a-4947-8134-b92e4f75a01c', 'acc-313a0e00-3d02-4f0e-ae55-72299e18b2b0', 'post-1c860ad6-16d1-45f0-a397-9c2f8d288e7a', '小红书', '13800000010', '徐同学', '5000-8000',  '工商管理',         '杭州', '跟进中', NULL, '客户已表达明确意向',   NULL,                                                '客户关注MBA课程, 询问上课时间, 持续跟进中',              NOW() - INTERVAL 1 DAY, 'sales01',    'user-sales-1',         'sales01',                '沟通中', '运营已提醒', '留学', 'LC20260010', 'high',    'active',  NOW() + INTERVAL 1 DAY, NULL,                                       1, NOW() - INTERVAL 16 DAY, NOW() - INTERVAL 1  DAY),
  ('lead-test-11', 'emp-951c7ae5-8939-48a2-8085-057e00b90e33', 'acc-7f1cfee5-e6a7-4601-8ba9-e2d86fc143fe', 'post-caa250f3-f973-4a3b-9224-0de99c92438d', '抖音',   '13800000011', '孙同学', '8000-12000', '法学',             '北京', '跟进中', NULL, '客户已表达明确意向',   'https://example.com/uploads/captures/lead_11.png', '客户咨询法考, 已发送试听链接, 等待反馈',                  NOW() - INTERVAL 3 DAY, 'sales01',    'user-sales-1',         'sales01',                '沟通中', '运营已提醒', '法考', 'LC20260011', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-caa250f3-f973-4a3b-9224-0de99c92438d',  0, NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 3  DAY),
  ('lead-test-12', 'emp-3caf91e6-cc76-4699-9df5-b0f43312e2d9', 'acc-8c3f9d2f-75b4-433e-ac74-4e6694dc551e', 'post-506dcdf9-eae1-4e1a-bdc7-cb10d4916612', '小红书', '13800000012', '朱同学', '3000-5000',  '金融学',           '上海', '跟进中', NULL, '已发送报价单',         NULL,                                                '已发考研全程班报价 6800, 客户说需要考虑',                NOW() - INTERVAL 4 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '已报价', '运营已提醒', '考研', 'LC20260012', 'high',    'active',  NOW() + INTERVAL 1 DAY, NULL,                                       0, NOW() - INTERVAL 22 DAY, NOW() - INTERVAL 4  DAY),
  ('lead-test-13', 'emp-e31b183c-6096-41ce-8bde-ff8dc1b0f64e', 'acc-c9058951-bb9a-4b95-8801-7f9c780147cd', 'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e', '抖音',   '13800000013', '马同学', '5000-8000',  '教育学',           '广州', '跟进中', NULL, '已发送报价单',         'https://example.com/uploads/captures/lead_13.png', '客户对教师资格证班型感兴趣, 已报价 4580, 待回复',          NOW() - INTERVAL 5 DAY, 'sales_b',    'USR_SALES_B',          'sales_b',                '已报价', '运营已提醒', '教师资格证', 'LC20260013', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e',  0, NOW() - INTERVAL 25 DAY, NOW() - INTERVAL 5  DAY);

-- ============================================================
-- §4. 协同中（3 条，sales01 + sales_a + sales_b 各 1）
-- 覆盖矩阵：
--   status=协同中 / add_status=运营已提醒 / process_status=已报价
--   intention_level=high / add_method=active / source_unknown=0
--   含 next_follow_time + sales_feedback
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
  ('lead-test-14', 'emp-535645b4-0970-41aa-a1b7-41551d99d518', 'acc-a8fedd87-ae9c-469f-a528-9be19b43e775', 'post-a688b81a-1978-4977-a447-485226c5615f', '小红书', '13800000014', '胡同学', '10000-15000', '心理学',          '北京', '协同中', NULL, '运营+销售协同推进',   NULL,                     '客户预算与需求匹配度高, 需运营协助制作方案', NOW() - INTERVAL 2 DAY, 'sales01',    'user-sales-1',         'sales01',                '已报价', '运营已提醒', '考研', 'LC20260014', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-a688b81a-1978-4977-a447-485226c5615f',  0, NOW() - INTERVAL 18 DAY, NOW() - INTERVAL 2  DAY),
  ('lead-test-15', 'emp-337c3321-7773-4d33-864c-8797572ab623', 'acc-136afd7d-f8c3-4b13-8ab9-e10aa8ed1800', 'post-281e5c21-aaf2-462f-918b-b5e49477ae0e', '抖音',   '13800000015', '林同学', '8000-12000', '会计学',           '上海', '协同中', NULL, '运营+销售协同推进',   NULL,                     '客户预算与需求匹配度高, 需运营协助制作方案', NOW() - INTERVAL 3 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '已报价', '运营已提醒', 'CPA',  'LC20260015', 'high',    'active',  NOW() + INTERVAL 1 DAY, NULL,                                       0, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 3  DAY),
  ('lead-test-16', 'emp-292b122a-c487-4b39-a768-9cb44ce37ffc', 'acc-1eb0c2f6-cbcb-4654-938f-0666c222f8b0', 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb', '小红书', '13800000016', '何同学', '5000-8000',  '新闻传播',         '广州', '协同中', NULL, '运营+销售协同推进',   NULL,                     '客户预算与需求匹配度高, 需运营协助制作方案', NOW() - INTERVAL 4 DAY, 'sales_b',    'USR_SALES_B',          'sales_b',                '已报价', '运营已提醒', '雅思', 'LC20260016', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb',  0, NOW() - INTERVAL 23 DAY, NOW() - INTERVAL 4  DAY);

-- ============================================================
-- §5. 运营已处理（4 条，sales01 x 2 + sales_a + sales_b）
-- 覆盖矩阵：
--   status=运营已处理 / add_status=已添加 / process_status=待成交
--   intention_level=high(2) + mid(2) / add_method=active(2) + passive(2) / source_unknown=0
--   含 next_follow_time + sales_feedback
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
  ('lead-test-17', 'emp-bd0c8410-1358-4e15-b164-ff7aeff9f84a', 'acc-181ee5b9-9f4c-495e-b647-f97d12f494a5', 'post-02173f96-d7f5-4340-84f4-27da3be5c997', '抖音',   '13800000017', '高同学', '3000-5000',  '计算机科学与技术', '深圳', '运营已处理', NULL, '运营已完成初步审核', 'https://example.com/uploads/captures/lead_17.png', '客户已通过微信好友申请, 已发送课程资料',        NOW() - INTERVAL 1 DAY, 'sales01',    'user-sales-1',         'sales01',                '待成交', '已添加', '考研', 'LC20260017', 'high',    'active',  NOW() + INTERVAL 1 DAY, 'post-02173f96-d7f5-4340-84f4-27da3be5c997',  0, NOW() - INTERVAL 19 DAY, NOW() - INTERVAL 1  DAY),
  ('lead-test-18', 'emp-3d64d870-862a-4947-8134-b92e4f75a01c', 'acc-313a0e00-3d02-4f0e-ae55-72299e18b2b0', 'post-1c860ad6-16d1-45f0-a397-9c2f8d288e7a', '小红书', '13800000018', '罗同学', '5000-8000',  '工商管理',         '杭州', '运营已处理', NULL, '运营已完成初步审核', NULL,                                                '客户已通过微信好友申请, 已发送课程资料',        NOW() - INTERVAL 2 DAY, 'sales01',    'user-sales-1',         'sales01',                '待成交', '已添加', '留学', 'LC20260018', 'high',    'active',  NOW() + INTERVAL 1 DAY, NULL,                                       0, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 2  DAY),
  ('lead-test-19', 'emp-951c7ae5-8939-48a2-8085-057e00b90e33', 'acc-7f1cfee5-e6a7-4601-8ba9-e2d86fc143fe', 'post-caa250f3-f973-4a3b-9224-0de99c92438d', '抖音',   '13800000019', '郑同学', '3000-5000',  '法学',             '北京', '运营已处理', NULL, '运营已完成初步审核', 'https://example.com/uploads/captures/lead_19.png', '客户已通过微信好友申请, 已发送课程资料',        NOW() - INTERVAL 3 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '待成交', '已添加', '公考', 'LC20260019', 'mid',     'passive', NOW() + INTERVAL 1 DAY, 'post-caa250f3-f973-4a3b-9224-0de99c92438d',  0, NOW() - INTERVAL 24 DAY, NOW() - INTERVAL 3  DAY),
  ('lead-test-20', 'emp-3caf91e6-cc76-4699-9df5-b0f43312e2d9', 'acc-8c3f9d2f-75b4-433e-ac74-4e6694dc551e', 'post-506dcdf9-eae1-4e1a-bdc7-cb10d4916612', '小红书', '13800000020', '梁同学', '5000-8000',  '金融学',           '上海', '运营已处理', NULL, '运营已完成初步审核', NULL,                                                '客户已通过微信好友申请, 已发送课程资料',        NOW() - INTERVAL 4 DAY, 'sales_b',    'USR_SALES_B',          'sales_b',                '待成交', '已添加', '考研', 'LC20260020', 'mid',     'passive', NOW() + INTERVAL 1 DAY, NULL,                                       0, NOW() - INTERVAL 27 DAY, NOW() - INTERVAL 4  DAY);

-- ============================================================
-- §6. 已添加通过（4 条，sales01 x 2 + sales_a + sales_b）
-- 覆盖矩阵：
--   status=已添加通过 / add_status=已添加 / process_status=待成交
--   intention_level=mid / add_method=passive / source_unknown=0
--   含 sales_feedback
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
  ('lead-test-21', 'emp-e31b183c-6096-41ce-8bde-ff8dc1b0f64e', 'acc-c9058951-bb9a-4b95-8801-7f9c780147cd', 'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e', '抖音',   '13800000021', '谢同学', '3000-5000',  '教育学',           '广州', '已添加通过', NULL, '客户已通过好友申请',   'https://example.com/uploads/captures/lead_21.png', '客户活跃度高, 朋友圈互动频繁, 商机较好',        NOW() - INTERVAL 1 DAY, 'sales01',    'user-sales-1',         'sales01',                '待成交', '已添加', '教师资格证', 'LC20260021', 'mid',     'passive', NULL,                  'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e',  0, NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 1  DAY),
  ('lead-test-22', 'emp-535645b4-0970-41aa-a1b7-41551d99d518', 'acc-a8fedd87-ae9c-469f-a528-9be19b43e775', 'post-a688b81a-1978-4977-a447-485226c5615f', '小红书', '13800000022', '宋同学', '5000-8000',  '心理学',           '深圳', '已添加通过', NULL, '客户已通过好友申请',   NULL,                                                '客户活跃度高, 朋友圈互动频繁, 商机较好',        NOW() - INTERVAL 2 DAY, 'sales01',    'user-sales-1',         'sales01',                '待成交', '已添加', '考研', 'LC20260022', 'mid',     'passive', NULL,                  NULL,                                       0, NOW() - INTERVAL 22 DAY, NOW() - INTERVAL 2  DAY),
  ('lead-test-23', 'emp-337c3321-7773-4d33-864c-8797572ab623', 'acc-136afd7d-f8c3-4b13-8ab9-e10aa8ed1800', 'post-281e5c21-aaf2-462f-918b-b5e49477ae0e', '抖音',   '13800000023', '唐同学', '8000-12000', '会计学',           '杭州', '已添加通过', NULL, '客户已通过好友申请',   'https://example.com/uploads/captures/lead_23.png', '客户活跃度高, 朋友圈互动频繁, 商机较好',        NOW() - INTERVAL 3 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '待成交', '已添加', 'CPA',  'LC20260023', 'mid',     'passive', NULL,                  'post-281e5c21-aaf2-462f-918b-b5e49477ae0e',  0, NOW() - INTERVAL 25 DAY, NOW() - INTERVAL 3  DAY),
  ('lead-test-24', 'emp-292b122a-c487-4b39-a768-9cb44ce37ffc', 'acc-1eb0c2f6-cbcb-4654-938f-0666c222f8b0', 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb', '小红书', '13800000024', '韩同学', '5000-8000',  '新闻传播',         '北京', '已添加通过', NULL, '客户已通过好友申请',   NULL,                                                '客户活跃度高, 朋友圈互动频繁, 商机较好',        NOW() - INTERVAL 4 DAY, 'sales_b',    'USR_SALES_B',          'sales_b',                '待成交', '已添加', '雅思', 'LC20260024', 'mid',     'passive', NULL,                  NULL,                                       0, NOW() - INTERVAL 28 DAY, NOW() - INTERVAL 4  DAY);

-- ============================================================
-- §7. 已成交（4 条，sales01 x 2 + sales_a + sales_b）
-- 覆盖矩阵：
--   status=已成交 / add_status=已添加 / process_status=已成交
--   intention_level=mid / add_method=passive / source_unknown=0
--   含 deal_amount（decimal(12,2)）+ sales_feedback
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
  ('lead-test-25', 'emp-bd0c8410-1358-4e15-b164-ff7aeff9f84a', 'acc-181ee5b9-9f4c-495e-b647-f97d12f494a5', 'post-02173f96-d7f5-4340-84f4-27da3be5c997', '抖音',   '13800000025', '冯同学', '5000-8000',  '计算机科学与技术', '上海', '已成交', 2380.50, '客户已付款, 课程已开通',  'https://example.com/uploads/captures/lead_25.png', '客户已确认报名并完成付款, 后续服务已交接',  NOW() - INTERVAL 1 DAY, 'sales01',    'user-sales-1',         'sales01',                '已成交', '已添加', '考研', 'LC20260025', 'mid',     'passive', NULL,                  'post-02173f96-d7f5-4340-84f4-27da3be5c997',  0, NOW() - INTERVAL 28 DAY, NOW() - INTERVAL 1  DAY),
  ('lead-test-26', 'emp-3d64d870-862a-4947-8134-b92e4f75a01c', 'acc-313a0e00-3d02-4f0e-ae55-72299e18b2b0', 'post-1c860ad6-16d1-45f0-a397-9c2f8d288e7a', '小红书', '13800000026', '邓同学', '3000-5000',  '工商管理',         '广州', '已成交', 4580.00, '客户已付款, 课程已开通',  NULL,                                                '客户已确认报名并完成付款, 后续服务已交接',  NOW() - INTERVAL 2 DAY, 'sales01',    'user-sales-1',         'sales01',                '已成交', '已添加', '留学', 'LC20260026', 'mid',     'passive', NULL,                  NULL,                                       0, NOW() - INTERVAL 25 DAY, NOW() - INTERVAL 2  DAY),
  ('lead-test-27', 'emp-951c7ae5-8939-48a2-8085-057e00b90e33', 'acc-7f1cfee5-e6a7-4601-8ba9-e2d86fc143fe', 'post-caa250f3-f973-4a3b-9224-0de99c92438d', '抖音',   '13800000027', '曹同学', '8000-12000', '法学',             '深圳', '已成交', 6800.00, '客户已付款, 课程已开通',  'https://example.com/uploads/captures/lead_27.png', '客户已确认报名并完成付款, 后续服务已交接',  NOW() - INTERVAL 3 DAY, 'sales_a',    'USR_SALES_A',          'sales_a',                '已成交', '已添加', '法考', 'LC20260027', 'mid',     'passive', NULL,                  'post-caa250f3-f973-4a3b-9224-0de99c92438d',  0, NOW() - INTERVAL 26 DAY, NOW() - INTERVAL 3  DAY),
  ('lead-test-28', 'emp-3caf91e6-cc76-4699-9df5-b0f43312e2d9', 'acc-8c3f9d2f-75b4-433e-ac74-4e6694dc551e', 'post-506dcdf9-eae1-4e1a-bdc7-cb10d4916612', '小红书', '13800000028', '彭同学', '5000-8000',  '金融学',           '杭州', '已成交', 3980.00, '客户已付款, 课程已开通',  NULL,                                                '客户已确认报名并完成付款, 后续服务已交接',  NOW() - INTERVAL 4 DAY, 'sales_b',    'USR_SALES_B',          'sales_b',                '已成交', '已添加', 'CPA',  'LC20260028', 'mid',     'passive', NULL,                  NULL,                                       0, NOW() - INTERVAL 29 DAY, NOW() - INTERVAL 4  DAY);

-- ============================================================
-- §8. 无效（4 条，sales01 x 2 + sales_a + sales_b）
-- 覆盖矩阵：
--   status=无效 / add_status=已拒绝 / process_status=无效
--   intention_level=low / add_method=active(2) + passive(2) / source_unknown=0
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
  ('lead-test-29', 'emp-e31b183c-6096-41ce-8bde-ff8dc1b0f64e', 'acc-c9058951-bb9a-4b95-8801-7f9c780147cd', 'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e', '抖音',   '13800000029', '曾同学', '3000-5000',  '教育学',           '北京', '无效', NULL, '客户明确表示无需求',   NULL,                     NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '无效', '已拒绝', '考研', 'LC20260029', 'low',     'active',  NULL,                  'post-ae2d600e-5ee9-405d-af9c-ad2bf12a1e7e',  0, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 10 DAY),
  ('lead-test-30', 'emp-535645b4-0970-41aa-a1b7-41551d99d518', 'acc-a8fedd87-ae9c-469f-a528-9be19b43e775', 'post-a688b81a-1978-4977-a447-485226c5615f', '小红书', '13800000030', '蒋同学', '5000-8000',  '心理学',           '上海', '无效', NULL, '客户明确表示无需求',   'https://example.com/uploads/captures/lead_30.png', NULL,                                       NULL,        'sales01',    'user-sales-1',         'sales01',                '无效', '已拒绝', '留学', 'LC20260030', 'low',     'active',  NULL,                  NULL,                                       0, NOW() - INTERVAL 22 DAY, NOW() - INTERVAL 11 DAY),
  ('lead-test-31', 'emp-337c3321-7773-4d33-864c-8797572ab623', 'acc-136afd7d-f8c3-4b13-8ab9-e10aa8ed1800', 'post-281e5c21-aaf2-462f-918b-b5e49477ae0e', '抖音',   '13800000031', '蔡同学', '8000-12000', '会计学',           '广州', '无效', NULL, '客户明确表示无需求',   NULL,                     NULL,                                       NULL,        'sales_a',    'USR_SALES_A',          'sales_a',                '无效', '已拒绝', 'CPA',  'LC20260031', 'low',     'passive', NULL,                  'post-281e5c21-aaf2-462f-918b-b5e49477ae0e',  0, NOW() - INTERVAL 23 DAY, NOW() - INTERVAL 12 DAY),
  ('lead-test-32', 'emp-292b122a-c487-4b39-a768-9cb44ce37ffc', 'acc-1eb0c2f6-cbcb-4654-938f-0666c222f8b0', 'post-06d6f755-be65-440f-96f6-f5b2f0fbe4fb', '小红书', '13800000032', '袁同学', '5000-8000',  '新闻传播',         '深圳', '无效', NULL, '客户明确表示无需求',   'https://example.com/uploads/captures/lead_32.png', NULL,                                       NULL,        'sales_b',    'USR_SALES_B',          'sales_b',                '无效', '已拒绝', '雅思', 'LC20260032', 'low',     'passive', NULL,                  NULL,                                       0, NOW() - INTERVAL 24 DAY, NOW() - INTERVAL 13 DAY);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证 SQL：统计各维度分布
-- ============================================================
SELECT '=== 1. status 分布 ===' AS section;
SELECT status, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY status
ORDER BY cnt DESC;

SELECT '=== 2. add_status 分布 ===' AS section;
SELECT add_status, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY add_status
ORDER BY cnt DESC;

SELECT '=== 3. process_status 分布 ===' AS section;
SELECT process_status, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY process_status
ORDER BY cnt DESC;

SELECT '=== 4. intention_level 分布 ===' AS section;
SELECT intention_level, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY intention_level
ORDER BY cnt DESC;

SELECT '=== 5. add_method 分布 ===' AS section;
SELECT add_method, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY add_method
ORDER BY cnt DESC;

SELECT '=== 6. source_unknown 分布 ===' AS section;
SELECT source_unknown, COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY source_unknown
ORDER BY cnt DESC;

SELECT '=== 7. assigned_sales_user_id 分布 ===' AS section;
SELECT
  COALESCE(assigned_sales_user_id, '(NULL/未分配)') AS sales_id,
  COUNT(*) AS cnt
FROM leads
WHERE id LIKE 'lead-test-%'
GROUP BY assigned_sales_user_id
ORDER BY cnt DESC;

SELECT '=== 8. 总计 ===' AS section;
SELECT COUNT(*) AS total_fixture_leads FROM leads WHERE id LIKE 'lead-test-%';

-- ============================================================
-- 回滚方法（如需清理 fixture 数据）：
--   DELETE FROM leads WHERE id LIKE 'lead-test-%' OR lead_code LIKE 'LC2026%';
-- ============================================================
