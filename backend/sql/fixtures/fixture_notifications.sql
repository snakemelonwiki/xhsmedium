-- ============================================================
-- B 端 1.2 fixture: notifications（系统通知）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0（lan_dual_role_system）
-- 数量：35 条（13 个 type_code 全覆盖）
--
-- 重要：实际表 schema 与任务简报中"已 SHOW COLUMNS 核对"的描述不一致。
--       本文件按 backend/src/entities/notification.entity.ts 的真实
--       字段生成（id, receiver_id, sender_id, port_type, type_code, title,
--       content, related_id, related_type, read_status, created_at, updated_at）。
--       任务简报中提到的 is_read / read_at / target_view 字段在当前
--       schema 中实际是 read_status（tinyint 0/1），且没有 read_at / target_view，
--       因此本 fixture 写入 read_status 而非 is_read，且不写 read_at / target_view。
--
-- 依赖：
--   - backend/sql/fixtures/fixture_leads.sql（lead-test-001..015）
--   - backend/sql/fixtures/fixture_orders.sql（order-test-001..014）
--   - 后端测试账号脚本 add-test-users-for-v1.2.sql（USR_SALES_A/B、academic02、admin）
--   - ddl/seed-test-data.sql（user-sales-1、user-00355085-...、user-admin-1）
--
-- is_read 分布：60% 未读（21 条） / 40% 已读（14 条）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 清理旧 fixture（按 ID 前缀），保证可重入
DELETE FROM notifications WHERE id LIKE 'notif-test-%';

INSERT INTO notifications (
  id, receiver_id, sender_id, port_type, type_code, title, content,
  related_id, related_type, read_status, created_at, updated_at
)
VALUES
  -- ============ lead_assigned（3 条，receiver=销售，port=sales）===========
  ('notif-test-001', 'user-sales-1',  'user-admin-1', 'sales', 'lead_assigned',
   '新客资分配通知', '系统已将小红书客户【张同学】分配给您，请尽快跟进。',
   'lead-test-001', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 8 MINUTE),  DATE_SUB(NOW(), INTERVAL 8 MINUTE)),

  ('notif-test-002', 'USR_SALES_A',   'user-admin-1', 'sales', 'lead_assigned',
   '新客资分配通知', '系统已将抖音客户【李同学】分配给您，请尽快跟进。',
   'lead-test-002', 'lead', 1,
   DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 30 MINUTE)),

  ('notif-test-003', 'USR_SALES_B',   'user-admin-1', 'sales', 'lead_assigned',
   '新客资分配通知', '系统已将公众号客户【王同学】分配给您，请尽快跟进。',
   'lead-test-003', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 12 MINUTE), DATE_SUB(NOW(), INTERVAL 12 MINUTE)),

  -- ============ collaboration_requested（3 条，receiver=运营，port=operations）===========
  ('notif-test-004', 'user-00355085-9690-4f9b-9892-470a11112dea', 'user-sales-1', 'operations', 'collaboration_requested',
   '协同任务待处理', '销售【sales01】发起提醒客户的协同任务（lead-test-001），请尽快处理。',
   'collab-test-001', 'collab', 1,
   DATE_SUB(NOW(), INTERVAL 5 MINUTE),  DATE_SUB(NOW(), INTERVAL 4 MINUTE)),

  ('notif-test-005', 'user-00355085-9690-4f9b-9892-470a11112dea', 'USR_SALES_A',  'operations', 'collaboration_requested',
   '协同任务待处理', '销售【sales_a】发起补充信息的协同任务（lead-test-002），请尽快处理。',
   'collab-test-002', 'collab', 0,
   DATE_SUB(NOW(), INTERVAL 12 MINUTE), DATE_SUB(NOW(), INTERVAL 12 MINUTE)),

  ('notif-test-006', 'user-00355085-9690-4f9b-9892-470a11112dea', 'USR_SALES_B',  'operations', 'collaboration_requested',
   '协同任务待处理', '销售【sales_b】发起身份核验的协同任务（lead-test-003），请尽快处理。',
   'collab-test-003', 'collab', 1,
   DATE_SUB(NOW(), INTERVAL 8 MINUTE),  DATE_SUB(NOW(), INTERVAL 6 MINUTE)),

  -- ============ customer_not_passed（2 条，receiver=运营，port=operations）===========
  ('notif-test-007', 'user-00355085-9690-4f9b-9892-470a11112dea', NULL, 'operations', 'customer_not_passed',
   '客户未通过企微', '客户【赵同学】在 lead-test-004 上未通过企微申请，需要运营协助再次触达。',
   'lead-test-004', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 22 MINUTE), DATE_SUB(NOW(), INTERVAL 22 MINUTE)),

  ('notif-test-008', 'user-00355085-9690-4f9b-9892-470a11112dea', NULL, 'operations', 'customer_not_passed',
   '客户未通过企微', '客户【陈同学】在 lead-test-005 上连续 3 次未通过企微，需要评估是否降级为流失。',
   'lead-test-005', 'lead', 1,
   DATE_SUB(NOW(), INTERVAL 45 MINUTE), DATE_SUB(NOW(), INTERVAL 40 MINUTE)),

  -- ============ collaboration_handled（2 条，receiver=销售，port=sales）===========
  ('notif-test-009', 'user-sales-1',  'user-00355085-9690-4f9b-9892-470a11112dea', 'sales', 'collaboration_handled',
   '协同任务已处理', '运营已处理您发起的提醒客户协同任务（collab-test-006），处理结果：已通过短信触达。',
   'collab-test-006', 'collab', 0,
   DATE_SUB(NOW(), INTERVAL 10 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE)),

  ('notif-test-010', 'USR_SALES_A',   'user-00355085-9690-4f9b-9892-470a11112dea', 'sales', 'collaboration_handled',
   '协同任务已处理', '运营已处理您发起的补充信息协同任务（collab-test-007），处理结果：已收集完成。',
   'collab-test-007', 'collab', 1,
   DATE_SUB(NOW(), INTERVAL 25 MINUTE), DATE_SUB(NOW(), INTERVAL 25 MINUTE)),

  -- ============ customer_added（2 条，receiver=运营，port=operations）===========
  ('notif-test-011', 'user-00355085-9690-4f9b-9892-470a11112dea', 'user-sales-1', 'operations', 'customer_added',
   '客户已添加企微', '销售【sales01】已成功将客户【孙同学】添加为企微好友。',
   'lead-test-006', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 18 MINUTE), DATE_SUB(NOW(), INTERVAL 18 MINUTE)),

  ('notif-test-012', 'user-00355085-9690-4f9b-9892-470a11112dea', 'USR_SALES_A',  'operations', 'customer_added',
   '客户已添加企微', '销售【sales_a】已成功将客户【周同学】添加为企微好友。',
   'lead-test-007', 'lead', 1,
   DATE_SUB(NOW(), INTERVAL 50 MINUTE), DATE_SUB(NOW(), INTERVAL 45 MINUTE)),

  -- ============ lead_deal_done（2 条，receiver=主管，port=supervisor）===========
  ('notif-test-013', 'user-admin-1',  NULL, 'supervisor', 'lead_deal_done',
   '客资成交提醒', '销售【sales_b】已完成 lead-test-008 客资成交，成交金额 ¥3,800。',
   'lead-test-008', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 15 MINUTE), DATE_SUB(NOW(), INTERVAL 15 MINUTE)),

  ('notif-test-014', 'user-admin-1',  NULL, 'supervisor', 'lead_deal_done',
   '客资成交提醒', '销售【sales01】已完成 lead-test-009 客资成交，成交金额 ¥5,200。',
   'lead-test-009', 'lead', 1,
   DATE_SUB(NOW(), INTERVAL 40 MINUTE), DATE_SUB(NOW(), INTERVAL 38 MINUTE)),

  -- ============ order_created（3 条，receiver=教务，port=academic）===========
  ('notif-test-015', 'user-test-academic-02', 'user-sales-1', 'academic', 'order_created',
   '新订单待接收', '销售【sales01】创建了新订单 order-test-001，请尽快接收并安排教务。',
   'order-test-001', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 6 MINUTE),  DATE_SUB(NOW(), INTERVAL 6 MINUTE)),

  ('notif-test-016', 'user-test-academic-02', 'USR_SALES_A',  'academic', 'order_created',
   '新订单待接收', '销售【sales_a】创建了新订单 order-test-002，请尽快接收并安排教务。',
   'order-test-002', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 20 MINUTE), DATE_SUB(NOW(), INTERVAL 20 MINUTE)),

  ('notif-test-017', 'user-test-academic-02', 'USR_SALES_B',  'academic', 'order_created',
   '新订单待接收', '销售【sales_b】创建了新订单 order-test-003，请尽快接收并安排教务。',
   'order-test-003', 'order', 1,
   DATE_SUB(NOW(), INTERVAL 60 MINUTE), DATE_SUB(NOW(), INTERVAL 55 MINUTE)),

  -- ============ order_updated（3 条，receiver=销售，port=sales）===========
  ('notif-test-018', 'user-sales-1',  'user-test-academic-02', 'sales', 'order_updated',
   '订单状态更新', '订单 order-test-004 状态已更新为【进行中】。',
   'order-test-004', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 9 MINUTE),  DATE_SUB(NOW(), INTERVAL 9 MINUTE)),

  ('notif-test-019', 'USR_SALES_A',   'user-test-academic-02', 'sales', 'order_updated',
   '订单状态更新', '订单 order-test-005 状态已更新为【待交付】。',
   'order-test-005', 'order', 1,
   DATE_SUB(NOW(), INTERVAL 32 MINUTE), DATE_SUB(NOW(), INTERVAL 30 MINUTE)),

  ('notif-test-020', 'USR_SALES_B',   'user-test-academic-02', 'sales', 'order_updated',
   '订单状态更新', '订单 order-test-006 状态已更新为【已完成】。',
   'order-test-006', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 70 MINUTE), DATE_SUB(NOW(), INTERVAL 70 MINUTE)),

  -- ============ order_abnormal（4 条：2 sales + 2 admin）===========
  ('notif-test-021', 'user-sales-1',  'user-test-academic-02', 'sales', 'order_abnormal',
   '订单异常告警', '订单 order-test-007 超过 48 小时未推进，状态异常，请尽快处理。',
   'order-test-007', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 4 MINUTE),  DATE_SUB(NOW(), INTERVAL 4 MINUTE)),

  ('notif-test-022', 'USR_SALES_A',   'user-test-academic-02', 'sales', 'order_abnormal',
   '订单异常告警', '订单 order-test-008 客户投诉处理中，请尽快介入。',
   'order-test-008', 'order', 1,
   DATE_SUB(NOW(), INTERVAL 28 MINUTE), DATE_SUB(NOW(), INTERVAL 25 MINUTE)),

  ('notif-test-023', 'user-admin-1',  NULL, 'supervisor', 'order_abnormal',
   '订单异常告警', '订单 order-test-009 已超时未推进，请关注销售或教务端的处理进展。',
   'order-test-009', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 11 MINUTE), DATE_SUB(NOW(), INTERVAL 11 MINUTE)),

  ('notif-test-024', 'user-admin-1',  NULL, 'supervisor', 'order_abnormal',
   '订单异常告警', '订单 order-test-010 客户发起退款申请，请关注。',
   'order-test-010', 'order', 1,
   DATE_SUB(NOW(), INTERVAL 55 MINUTE), DATE_SUB(NOW(), INTERVAL 50 MINUTE)),

  -- ============ order_node_due（4 条：2 academic + 2 sales）===========
  ('notif-test-025', 'user-test-academic-02', NULL, 'academic', 'order_node_due',
   '订单节点即将到期', '订单 order-test-011 的【中期反馈】节点将在 24 小时内到期，请尽快完成。',
   'order-test-011', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 7 MINUTE),  DATE_SUB(NOW(), INTERVAL 7 MINUTE)),

  ('notif-test-026', 'user-test-academic-02', NULL, 'academic', 'order_node_due',
   '订单节点即将到期', '订单 order-test-012 的【结案报告】节点已逾期 1 天，请优先处理。',
   'order-test-012', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 16 MINUTE), DATE_SUB(NOW(), INTERVAL 16 MINUTE)),

  ('notif-test-027', 'user-sales-1',  'user-test-academic-02', 'sales', 'order_node_due',
   '订单节点即将到期', '订单 order-test-013 的【客户回访】节点将在 48 小时内到期，请配合教务推进。',
   'order-test-013', 'order', 1,
   DATE_SUB(NOW(), INTERVAL 38 MINUTE), DATE_SUB(NOW(), INTERVAL 35 MINUTE)),

  ('notif-test-028', 'USR_SALES_A',   'user-test-academic-02', 'sales', 'order_node_due',
   '订单节点即将到期', '订单 order-test-014 的【续费沟通】节点即将到期，请提前介入。',
   'order-test-014', 'order', 0,
   DATE_SUB(NOW(), INTERVAL 90 MINUTE), DATE_SUB(NOW(), INTERVAL 90 MINUTE)),

  -- ============ collaboration_timeout（2 条：1 admin + 1 staff）===========
  ('notif-test-029', 'user-admin-1',  NULL, 'supervisor', 'collaboration_timeout',
   '协同任务超时告警', '协同任务 collab-test-012 已超过 30 分钟无人处理，请关注运营端处理情况。',
   'collab-test-012', 'collab', 0,
   DATE_SUB(NOW(), INTERVAL 2 MINUTE),  DATE_SUB(NOW(), INTERVAL 2 MINUTE)),

  ('notif-test-030', 'user-00355085-9690-4f9b-9892-470a11112dea', NULL, 'operations', 'collaboration_timeout',
   '协同任务超时提醒', '您负责的协同任务 collab-test-013 已超时，请立即处理或关闭。',
   'collab-test-013', 'collab', 1,
   DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 28 MINUTE)),

  -- ============ export_finished（3 条，receiver 各种，port 各种）===========
  ('notif-test-031', 'user-admin-1',  NULL, 'supervisor', 'export_finished',
   '数据导出完成', '主管端【全量客资】导出任务已完成，文件可在导出中心下载。',
   'export-20260602-001', 'export', 0,
   DATE_SUB(NOW(), INTERVAL 3 MINUTE),  DATE_SUB(NOW(), INTERVAL 3 MINUTE)),

  ('notif-test-032', 'user-sales-1',  NULL, 'sales', 'export_finished',
   '数据导出完成', '【我的客户】导出任务已完成，共导出 28 条记录。',
   'export-20260602-002', 'export', 0,
   DATE_SUB(NOW(), INTERVAL 14 MINUTE), DATE_SUB(NOW(), INTERVAL 14 MINUTE)),

  ('notif-test-033', 'user-test-academic-02', NULL, 'academic', 'export_finished',
   '数据导出完成', '教务端【在读订单】导出任务已完成，共导出 15 条记录。',
   'export-20260602-003', 'export', 1,
   DATE_SUB(NOW(), INTERVAL 65 MINUTE), DATE_SUB(NOW(), INTERVAL 60 MINUTE)),

  -- ============ supervisor_suggestion（2 条，receiver=运营，port=operations）===========
  ('notif-test-034', 'user-00355085-9690-4f9b-9892-470a11112dea', 'user-admin-1', 'operations', 'supervisor_suggestion',
   '主管建议：优化发布时段', '主管建议您在 post-test-001 这篇笔记发布后的 2 小时内主动与评论客户互动。',
   'post-test-001', 'post', 0,
   DATE_SUB(NOW(), INTERVAL 19 MINUTE), DATE_SUB(NOW(), INTERVAL 19 MINUTE)),

  ('notif-test-035', 'user-00355085-9690-4f9b-9892-470a11112dea', 'user-admin-1', 'operations', 'supervisor_suggestion',
   '主管建议：调整账号人设', '主管建议您将 post-test-002 这篇笔记的人设语气从"专业顾问"调整为"亲切学姐"。',
   'post-test-002', 'post', 0,
   DATE_SUB(NOW(), INTERVAL 48 MINUTE), DATE_SUB(NOW(), INTERVAL 48 MINUTE)),

  -- ============ lead_source_confirmed（E/P1-05：TC-B-027 需要）============
  -- 销售回填"来源已确认"（passive → active 切换）触发；receiver=运营
  -- 原 35 条 notif 中 0 条 type_code='lead_source_confirmed'，新增 2 条。
  ('notif-test-036', 'user-00355085-9690-4f9b-9892-470a11112dea', 'user-sales-1', 'operations', 'lead_source_confirmed',
   '客资来源已确认', '销售【sales01】已回填 lead-test-09 的来源信息（小红书评论 → 主动添加），请运营侧继续跟进。',
   'lead-test-09', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 6 MINUTE), DATE_SUB(NOW(), INTERVAL 6 MINUTE)),

  ('notif-test-037', 'user-00355085-9690-4f9b-9892-470a11112dea', 'USR_SALES_A', 'operations', 'lead_source_confirmed',
   '客资来源已确认', '销售【sales_a】已确认 lead-test-12 的来源（小红书私信 → 被动添加），原 status=新客资，已转为待通过。',
   'lead-test-12', 'lead', 0,
   DATE_SUB(NOW(), INTERVAL 24 MINUTE), DATE_SUB(NOW(), INTERVAL 24 MINUTE));

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §验证查询（执行后请手动跑以下查询确认覆盖）
-- ============================================================

-- 验证 1：按 type_code 分布
-- SELECT type_code, COUNT(*) AS cnt FROM notifications
-- WHERE id LIKE 'notif-test-%' GROUP BY type_code ORDER BY type_code;

-- 验证 2：按 port_type 分布
-- SELECT port_type, COUNT(*) AS cnt FROM notifications
-- WHERE id LIKE 'notif-test-%' GROUP BY port_type ORDER BY port_type;

-- 验证 3：按 receiver_id 分布
-- SELECT receiver_id, COUNT(*) AS cnt FROM notifications
-- WHERE id LIKE 'notif-test-%' GROUP BY receiver_id ORDER BY receiver_id;

-- 验证 4：未读 / 已读 分布（应 21 / 14）
-- SELECT read_status, COUNT(*) AS cnt FROM notifications
-- WHERE id LIKE 'notif-test-%' GROUP BY read_status ORDER BY read_status;

-- 验证 5：type_code × port_type 交叉表
-- SELECT type_code, port_type, COUNT(*) AS cnt FROM notifications
-- WHERE id LIKE 'notif-test-%' GROUP BY type_code, port_type ORDER BY type_code, port_type;

-- ============================================================
-- 文档结束
-- ============================================================
