-- ============================================================
-- B 端 1.2 fixture: collaboration_tasks（协同任务）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0（lan_dual_role_system）
-- 数量：14 条（5 个 status × 4 个 type 全覆盖）
--
-- 重要：实际表 schema 与任务简报中"已 SHOW COLUMNS 核对"的描述不一致。
--       本文件按 backend/src/entities/collaboration-task.entity.ts 的真实
--       字段生成（id, lead_id, requester_id, handler_id, type, reason,
--       status, handled_note, requested_at, handled_at, created_at, updated_at）。
--       任务简报中提到的 requester_name/handler_name/expected_handle_at/
--       closed_at/close_reason/timed_out_at 等字段在当前 schema 中不存在，
--       强行 INSERT 会失败，因此本 fixture 不写入这些列。
--       业务语义映射：
--         - "close_reason" → handled_note（已 handled/closed 时填）
--         - "closed_at"    → handled_at（已 handled/closed 时填）
--         - "timed_out_at" → 仅以 status='timeout' 表达，无独立时间戳
--         - 30 分钟超时由 collabTimeoutScan 扫描器在 status='pending' 且
--           requested_at 距今 > 30min 时将 status 改为 'timeout'
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 清理旧 fixture（按 ID 前缀），保证可重入
DELETE FROM collaboration_tasks WHERE id LIKE 'collab-test-%';

INSERT INTO collaboration_tasks (
  id, lead_id, requester_id, handler_id, type, reason, status,
  handled_note, requested_at, handled_at, created_at, updated_at
)
VALUES
  -- ============ status = pending（2 条；handler_id 必须 NULL）===========
  ('collab-test-001', 'lead-test-001', 'user-sales-1',  NULL, 'remind_customer',
   '客户未通过申请添加好友，麻烦再次私信提醒', 'pending',
   NULL,
   DATE_SUB(NOW(), INTERVAL 5 MINUTE),  NULL,
   DATE_SUB(NOW(), INTERVAL 5 MINUTE),  DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  ('collab-test-002', 'lead-test-002', 'USR_SALES_A',   NULL, 'supplement_info',
   '客户咨询时未提供预算范围，运营需二次回访收集', 'pending',
   NULL,
   DATE_SUB(NOW(), INTERVAL 12 MINUTE), NULL,
   DATE_SUB(NOW(), INTERVAL 12 MINUTE), DATE_SUB(NOW(), INTERVAL 12 MINUTE)),

  -- ============ status = handling（3 条；handler_id = youlunrong）===========
  ('collab-test-003', 'lead-test-003', 'USR_SALES_B',   'user-00355085-9690-4f9b-9892-470a11112dea', 'verify_identity',
   '客户朋友圈设置三天可见，需要运营协助确认身份真实性', 'handling',
   NULL,
   DATE_SUB(NOW(), INTERVAL 8 MINUTE),  NULL,
   DATE_SUB(NOW(), INTERVAL 8 MINUTE),  DATE_SUB(NOW(), INTERVAL 2 MINUTE)),

  ('collab-test-004', 'lead-test-004', 'user-sales-1',  'user-00355085-9690-4f9b-9892-470a11112dea', 'second_touch',
   '客户首次跟进后 24h 未回复，请运营协助再次触达', 'handling',
   NULL,
   DATE_SUB(NOW(), INTERVAL 18 MINUTE), NULL,
   DATE_SUB(NOW(), INTERVAL 18 MINUTE), DATE_SUB(NOW(), INTERVAL 3 MINUTE)),

  ('collab-test-005', 'lead-test-005', 'USR_SALES_A',   'user-00355085-9690-4f9b-9892-470a11112dea', 'remind_customer',
   '客户在公众号留言咨询后未通过企微，需要二次提醒添加', 'handling',
   NULL,
   DATE_SUB(NOW(), INTERVAL 6 MINUTE),  NULL,
   DATE_SUB(NOW(), INTERVAL 6 MINUTE),  DATE_SUB(NOW(), INTERVAL 1 MINUTE)),

  -- ============ status = handled（3 条；handler_id + handled_note + handled_at）===========
  ('collab-test-006', 'lead-test-006', 'USR_SALES_B',   'user-00355085-9690-4f9b-9892-470a11112dea', 'remind_customer',
   '客户朋友圈三天可见，私信无回应', 'handled',
   '已通过短信 + 公众号模板消息二次触达，客户已读',
   DATE_SUB(NOW(), INTERVAL 22 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE),
   DATE_SUB(NOW(), INTERVAL 22 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE)),

  ('collab-test-007', 'lead-test-007', 'user-sales-1',  'user-00355085-9690-4f9b-9892-470a11112dea', 'supplement_info',
   '客户咨询时未提供意向服务类型', 'handled',
   '已通过问卷链接收集到客户预算及时间偏好，补充完成',
   DATE_SUB(NOW(), INTERVAL 25 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE),
   DATE_SUB(NOW(), INTERVAL 25 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE)),

  ('collab-test-008', 'lead-test-008', 'USR_SALES_A',   'user-00355085-9690-4f9b-9892-470a11112dea', 'verify_identity',
   '客户企业微信头像与小红书账号不一致，需要核验', 'handled',
   '已通过视频电话核验确认为本人，已打 verified 标签',
   DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE),
   DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE)),

  -- ============ status = closed（3 条；视为已处理后关闭，handled_at + handled_note）===========
  ('collab-test-009', 'lead-test-009', 'USR_SALES_B',   'user-00355085-9690-4f9b-9892-470a11112dea', 'second_touch',
   '客户首次跟进已超过 48h 未回复，需运营协助', 'closed',
   '客户在第二次触达时明确表示暂无需求，关闭协同并标记为已流失',
   DATE_SUB(NOW(), INTERVAL 28 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE),
   DATE_SUB(NOW(), INTERVAL 28 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  ('collab-test-010', 'lead-test-010', 'user-sales-1',  'user-00355085-9690-4f9b-9892-470a11112dea', 'supplement_info',
   '客户预算信息缺失，运营协助补充', 'closed',
   '客户预算已确认，但因服务类型不匹配，销售主动关闭协同',
   DATE_SUB(NOW(), INTERVAL 26 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE),
   DATE_SUB(NOW(), INTERVAL 26 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  ('collab-test-011', 'lead-test-011', 'USR_SALES_A',   'user-00355085-9690-4f9b-9892-470a11112dea', 'verify_identity',
   '客户身份存疑需运营协助核实', 'closed',
   '经核实为同行竞品调研，已关闭协同并加入黑名单',
   DATE_SUB(NOW(), INTERVAL 33 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE),
   DATE_SUB(NOW(), INTERVAL 33 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  -- ============ status = timeout（3 条；handler_id NULL；created_at 35 分钟前）===========
  -- 模拟 30 分钟无人处理的超时态
  ('collab-test-012', 'lead-test-012', 'USR_SALES_B',   NULL, 'remind_customer',
   '客户 30 分钟前分配后未触达', 'timeout',
   NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  ('collab-test-013', 'lead-test-013', 'user-sales-1',  NULL, 'supplement_info',
   '客户信息待补充，30 分钟未处理已超时', 'timeout',
   NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE)),

  ('collab-test-014', 'lead-test-014', 'USR_SALES_A',   NULL, 'second_touch',
   '客户首次跟进超过 30 分钟未触达，触发超时', 'timeout',
   NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 5 MINUTE));

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §验证查询（执行后请手动跑以下查询确认覆盖）
-- ============================================================

-- 验证 1：按 status 分布
-- SELECT status, COUNT(*) AS cnt FROM collaboration_tasks
-- WHERE id LIKE 'collab-test-%' GROUP BY status ORDER BY status;

-- 验证 2：按 type 分布
-- SELECT type, COUNT(*) AS cnt FROM collaboration_tasks
-- WHERE id LIKE 'collab-test-%' GROUP BY type ORDER BY type;

-- 验证 3：status × type 交叉表
-- SELECT status, type, COUNT(*) AS cnt FROM collaboration_tasks
-- WHERE id LIKE 'collab-test-%' GROUP BY status, type ORDER BY status, type;

-- 验证 4：requester 分布（应 3 个销售轮换）
-- SELECT requester_id, COUNT(*) AS cnt FROM collaboration_tasks
-- WHERE id LIKE 'collab-test-%' GROUP BY requester_id ORDER BY requester_id;

-- 验证 5：handler_id 规则（pending/timeout 应为 NULL，handling/handled/closed 应有值）
-- SELECT status, COUNT(*) AS total,
--        SUM(CASE WHEN handler_id IS NULL THEN 1 ELSE 0 END) AS null_handler,
--        SUM(CASE WHEN handler_id IS NOT NULL THEN 1 ELSE 0 END) AS has_handler
-- FROM collaboration_tasks
-- WHERE id LIKE 'collab-test-%' GROUP BY status ORDER BY status;

-- ============================================================
-- 文档结束
-- ============================================================
