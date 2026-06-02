-- ============================================================
-- B 端 1.2 fixture 数据：operation_logs（操作日志）
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 风格：INSERT IGNORE 可重入
--
-- 覆盖 15 种 action × 4 角色 user_id
-- 来源：backend/src/shared/operation-logs.constants.ts
-- target_id 优先使用真实存在的 leads/posts/accounts ID（已 SELECT 验证）
-- orders / collaboration_tasks 表当前为空，target_id 用合成 ID（无外键约束）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- §1. login / logout（target_type = user，自身登录登出）
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-001', 'user-sales-1', 'login', 'user', 'user-sales-1',
   '{"method":"password","userAgent":"Mozilla/5.0","remember":false}',
   '192.168.1.1', '2026-06-02 08:30:00'),
  ('oplog-test-002', 'youlunrong', 'login', 'user', 'user-00355085-9690-4f9b-9892-470a11112dea',
   '{"method":"password","userAgent":"Mozilla/5.0"}',
   '192.168.1.2', '2026-06-02 08:35:00'),
  ('oplog-test-003', 'youlun', 'logout', 'user', 'user-admin-1',
   '{"sessionDuration":7200}',
   '192.168.1.3', '2026-06-01 20:00:00'),
  ('oplog-test-004', 'user-test-academic-02', 'logout', 'user', 'user-test-academic-02',
   '{"sessionDuration":3600}',
   '192.168.1.4', '2026-06-01 18:00:00');

-- ============================================================
-- §2. create / update / delete
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-005', 'user-sales-1', 'create', 'lead', 'lead-f4e98fb9-8ab2-48fc-be58-ed0d754ae345',
   '{"platform":"小红书","source":"表单录入","nickname":"小王"}',
   '192.168.1.5', '2026-05-20 09:30:00'),
  ('oplog-test-006', 'youlunrong', 'create', 'post', 'post-02173f96-d7f5-4340-84f4-27da3be5c997',
   '{"platform":"小红书","title":"五一出游穿搭"}',
   '192.168.1.6', '2026-05-15 10:00:00'),
  ('oplog-test-007', 'user-sales-1', 'update', 'lead', 'lead-9c461428-731b-4cf6-a8bd-3a0867005c38',
   '{"fields":["contact_info","remark"],"oldContactInfo":"13800000000","newContactInfo":"13800000001"}',
   '192.168.1.7', '2026-05-21 14:00:00'),
  ('oplog-test-008', 'youlun', 'update', 'user', 'USR_SALES_A',
   '{"fields":["role"],"oldRole":"sales","newRole":"sales"}',
   '192.168.1.8', '2026-05-10 11:00:00'),
  ('oplog-test-009', 'youlun', 'delete', 'account', 'acc-03cb71b8-7729-41e2-9885-11257fa95359',
   '{"reason":"客户要求删除账号","platform":"抖音"}',
   '192.168.1.9', '2026-04-15 10:00:00'),
  ('oplog-test-010', 'youlun', 'delete', 'employee', 'emp-academic-02',
   '{"reason":"测试数据清理"}',
   '192.168.1.10', '2026-04-20 10:00:00');

-- ============================================================
-- §3. disable / assign / reassign
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-011', 'youlun', 'disable', 'account', 'acc-06348c31-db6f-4b7b-afd7-b8f48486ce30',
   '{"reason":"账号被封","platform":"小红书"}',
   '192.168.1.1', '2026-05-05 10:00:00'),
  ('oplog-test-012', 'youlun', 'disable', 'user', 'USR_SALES_B',
   '{"reason":"离职"}',
   '192.168.1.2', '2026-05-08 10:00:00'),
  ('oplog-test-013', 'user-sales-1', 'assign', 'order', 'order-test-001',
   '{"assignee":"USR_SALES_A","previousAssignee":null}',
   '192.168.1.3', '2026-05-22 09:00:00'),
  ('oplog-test-014', 'youlun', 'assign', 'collab', 'collab-test-001',
   '{"assignee":"youlunrong","previousAssignee":null}',
   '192.168.1.4', '2026-05-22 09:30:00'),
  ('oplog-test-015', 'user-sales-1', 'reassign', 'order', 'order-test-002',
   '{"fromAssignee":"USR_SALES_A","toAssignee":"USR_SALES_B","reason":"销售 A 跟进困难"}',
   '192.168.1.5', '2026-05-25 16:00:00'),
  ('oplog-test-016', 'youlun', 'reassign', 'lead', 'lead-1e9d445f-2db7-4073-b069-b43c5472cac4',
   '{"fromAssignee":"USR_SALES_A","toAssignee":"USR_SALES_B","reason":"销售 A 离职"}',
   '192.168.1.6', '2026-05-26 10:00:00');

-- ============================================================
-- §4. status_change
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-017', 'user-sales-1', 'status_change', 'lead', 'lead-6b16f122-b359-4818-8298-8cef7e27e77b',
   '{"oldStatus":"新客资","newStatus":"跟进中"}',
   '192.168.1.7', '2026-05-22 10:00:00'),
  ('oplog-test-018', 'user-sales-1', 'status_change', 'order', 'order-test-003',
   '{"oldStatus":"待跟进","newStatus":"已成交"}',
   '192.168.1.8', '2026-05-28 14:00:00');

-- ============================================================
-- §5. export_create / export_download
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-019', 'youlunrong', 'export_create', 'export', 'exp-test-001',
   '{"exportType":"posts","filter":{"platform":"小红书"}}',
   '192.168.1.9', '2026-05-15 10:00:00'),
  ('oplog-test-020', 'user-sales-1', 'export_create', 'export', 'exp-test-005',
   '{"exportType":"leads","filter":{"status":"assigned"}}',
   '192.168.1.10', '2026-05-20 09:00:00'),
  ('oplog-test-021', 'youlun', 'export_download', 'export', 'exp-test-009',
   '{"exportType":"rankings","format":"csv"}',
   '192.168.1.1', '2026-05-31 23:30:00'),
  ('oplog-test-022', 'user-sales-1', 'export_download', 'export', 'exp-test-013',
   '{"exportType":"orders","format":"csv"}',
   '192.168.1.2', '2026-05-25 11:30:00');

-- ============================================================
-- §6. view_sensitive
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-023', 'youlun', 'view_sensitive', 'lead', 'lead-f4e98fb9-8ab2-48fc-be58-ed0d754ae345',
   '{"fields":["contact_info","phone","wechat"],"reason":"主管审计"}',
   '192.168.1.3', '2026-05-25 10:00:00'),
  ('oplog-test-024', 'user-sales-1', 'view_sensitive', 'lead', 'lead-9c461428-731b-4cf6-a8bd-3a0867005c38',
   '{"fields":["contact_info","phone"],"reason":"销售跟进"}',
   '192.168.1.4', '2026-05-26 11:00:00');

-- ============================================================
-- §7. handover（订单交接）
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-025', 'user-sales-1', 'handover', 'order', 'order-test-004',
   '{"fromSales":"USR_SALES_A","toSales":"USR_SALES_B","reason":"A 调整负责区域","includeFollowHistory":true}',
   '192.168.1.5', '2026-05-30 09:00:00'),
  ('oplog-test-026', 'youlun', 'handover', 'order', 'order-test-005',
   '{"fromSales":"USR_SALES_B","toSales":"user-sales-1","reason":"B 离职，整体回收","includeFollowHistory":true}',
   '192.168.1.6', '2026-05-31 10:00:00');

-- ============================================================
-- §8. abnormal_create / abnormal_close
-- ============================================================

INSERT IGNORE INTO operation_logs
  (id, user_id, action, target_type, target_id, detail, ip, created_at)
VALUES
  ('oplog-test-027', 'user-test-academic-02', 'abnormal_create', 'order', 'order-test-006',
   '{"type":"客户投诉","severity":"high","description":"课程内容与销售承诺不符"}',
   '192.168.1.7', '2026-05-28 15:00:00'),
  ('oplog-test-028', 'user-sales-1', 'abnormal_create', 'order', 'order-test-007',
   '{"type":"跟进超时","severity":"medium","description":"客户 7 天未回复"}',
   '192.168.1.8', '2026-05-29 16:00:00'),
  ('oplog-test-029', 'youlun', 'abnormal_close', 'order', 'order-test-006',
   '{"resolution":"已与客户沟通，重新安排课程","closedBy":"youlun"}',
   '192.168.1.9', '2026-05-30 17:00:00'),
  ('oplog-test-030', 'user-sales-1', 'abnormal_close', 'order', 'order-test-007',
   '{"resolution":"客户已重新激活","closedBy":"user-sales-1"}',
   '192.168.1.10', '2026-05-31 11:00:00'),

  -- ===== §9 协同任务 target_type=collaboration_task（E/P1-04：TC-B-039 需要）=====
  -- 原 30 条 oplog 中 0 条 target_type='collaboration_task'，新增 2 条：
  --   1. 销售发起协同（type=collaboration_task / action=create）
  --   2. 运营处理协同（type=collaboration_task / action=update / handled）
  ('oplog-test-031', 'USR_SALES_A', 'create', 'collaboration_task', 'collab-test-001',
   '{"type":"remind_customer","reason":"客户未通过申请添加好友","leadId":"lead-test-001"}',
   '192.168.1.11', '2026-05-22 09:00:00'),

  ('oplog-test-032', 'user-00355085-9690-4f9b-9892-470a11112dea', 'update', 'collaboration_task', 'collab-test-006',
   '{"type":"remind_customer","step":"handle","handledNote":"已通过短信触达客户","leadId":"lead-test-006"}',
   '192.168.1.12', '2026-05-22 11:30:00');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §9. 验证查询（执行后请手动跑以下 4 个查询确认）
-- ============================================================

-- 验证 1：总行数（应 = 30）
-- SELECT COUNT(*) AS total FROM operation_logs WHERE id LIKE 'oplog-test-%';

-- 验证 2：15 种 action 各 ≥ 1 条
-- SELECT action, COUNT(*) AS cnt FROM operation_logs WHERE id LIKE 'oplog-test-%' GROUP BY action ORDER BY action;

-- 验证 3：4 个 user_id 都有
-- SELECT user_id, COUNT(*) AS cnt FROM operation_logs WHERE id LIKE 'oplog-test-%' GROUP BY user_id ORDER BY user_id;

-- 验证 4：8 种 target_type 覆盖
-- SELECT target_type, COUNT(*) AS cnt FROM operation_logs WHERE id LIKE 'oplog-test-%' GROUP BY target_type ORDER BY target_type;

-- 文档结束
-- ============================================================
