-- ============================================================
-- B 端 1.2 fixture 数据：lead_drafts（录入草稿）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 实际 DB schema 与 spec 不一致：
--   - 列名 draft_type（NOT NULL）+ content_json（NOT NULL），不是 data_json
--   - 额外列 image_urls（json，可空）
-- 本脚本以 SHOW CREATE TABLE 为准，使用 draft_type + content_json
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

INSERT IGNORE INTO lead_drafts
  (id, user_id, draft_type, content_json, image_urls, created_at, updated_at)
VALUES
  -- 草稿 1：未填完的客资草稿（含截图）
  ('draft-test-001', 'youlunrong', 'lead',
   '{"platform":"小红书","nickname":"测试客户A","contact_info":"13800000001","wechat":"wx_test_001","remark":"五一想报班，预算 5000","assignedTo":"user-sales-1","capturedAt":"2026-05-30T15:00:00Z"}',
   JSON_ARRAY('http://localhost:3000/uploads/leads/draft-001-1.png','http://localhost:3000/uploads/leads/draft-001-2.png'),
   '2026-05-30 15:00:00', '2026-05-30 15:25:00'),

  -- 草稿 2：抖音客资草稿（无图）
  ('draft-test-002', 'youlunrong', 'lead',
   '{"platform":"抖音","nickname":"测试客户B","contact_info":"13800000002","wechat":"","remark":"私信咨询课程，意向中等","assignedTo":null,"capturedAt":"2026-06-01T10:30:00Z"}',
   NULL,
   '2026-06-01 10:30:00', '2026-06-01 10:30:00'),

  -- 草稿 3：双平台客资草稿（含图）
  ('draft-test-003', 'youlunrong', 'lead',
   '{"platform":"小红书","nickname":"测试客户C","contact_info":"13800000003","wechat":"wx_test_003","remark":"高净值客户，预算 1w+","assignedTo":"USR_SALES_A","capturedAt":"2026-06-02T08:15:00Z"}',
   JSON_ARRAY('http://localhost:3000/uploads/leads/draft-003-1.png'),
   '2026-06-02 08:15:00', '2026-06-02 08:40:00');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 验证查询（执行后请手动跑以下 3 个查询确认）
-- ============================================================

-- 验证 1：总行数（应 = 3）
-- SELECT COUNT(*) AS total FROM lead_drafts WHERE id LIKE 'draft-test-%';

-- 验证 2：draft_type 分布
-- SELECT draft_type, COUNT(*) AS cnt FROM lead_drafts WHERE id LIKE 'draft-test-%' GROUP BY draft_type ORDER BY draft_type;

-- 验证 3：content_json 字段为有效 JSON
-- SELECT id, JSON_VALID(content_json) AS valid, JSON_LENGTH(image_urls) AS img_count
--   FROM lead_drafts WHERE id LIKE 'draft-test-%' ORDER BY id;

-- 文档结束
-- ============================================================
