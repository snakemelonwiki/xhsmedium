-- ============================================================
-- B 端 1.2 测试用例账号补建脚本
-- 编写日期：2026-06-02
-- 适用：xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 密码统一：test123（明文，与现有 11 个账号一致）
-- 适用范围：doc/B端-v1.2-*.md 全部 6 个新测试文档 + 旧 B端-详细测试用例.md
-- 重要：执行前请先 ALTER TABLE 扩展 role 枚举加 'academic'（见 §0）
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- §0. ALTER TABLE：扩展 users.role 枚举加 'academic'
-- 原因：现有 role 枚举只支持 admin/staff/sales/owner
--       B 端 v1.2 验收需要 academic 角色（教务端）
-- 说明：扩展 ENUM 不会丢数据；如已存在其他枚举值，保持兼容
-- 如不需要该扩展，可整段注释掉（但 academic02 用户将无法创建）
-- ============================================================

ALTER TABLE users
  MODIFY COLUMN `role` ENUM('admin','staff','sales','academic','owner')
  COLLATE utf8mb4_unicode_ci NOT NULL;

-- ============================================================
-- §1. employees 表：补建教务员工
-- 现有 employees: EMP0003 ~ EMP0008, EMP0011, EMP0012
-- 补建 EMP0009（academic02 关联用，模拟 v1.2 验收 user-test-academic-02）
-- ============================================================

INSERT INTO employees (id, employee_code, name, phone, hire_date, status, created_at, updated_at)
VALUES
  ('emp-academic-02', 'EMP0009', '陈教务', '13800000009', '2026-05-01', '在职', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  phone = VALUES(phone),
  hire_date = VALUES(hire_date),
  status = VALUES(status),
  updated_at = NOW();

-- ============================================================
-- §2. users 表：补建 5 个测试账号
-- 必补：academic02（v1.2 验收 + 6 个新文档引用）
-- 选补：sales_a / sales_b（旧 B端-详细测试用例.md 权限隔离越权测试）
-- 选补：ops_c（旧 B端-详细测试用例.md 引用）
-- 选补：admin_d（旧 B端-详细测试用例.md 引用）
-- 全部密码：test123 明文（与现有 11 个账号一致）
-- ============================================================

INSERT INTO users (id, username, password, role, employee_id, status, created_at, updated_at)
VALUES
  -- 教务端核心账号（B 端 v1.2 必补）
  ('user-test-academic-02', 'academic02', 'test123', 'academic', 'emp-academic-02', 'active', NOW(), NOW()),

  -- 销售端补充账号（旧 B端-详细测试用例.md 选补，用于权限隔离越权）
  ('USR_SALES_A', 'sales_a', 'test123', 'sales', NULL, 'active', NOW(), NOW()),
  ('USR_SALES_B', 'sales_b', 'test123', 'sales', NULL, 'active', NOW(), NOW()),

  -- 运营端补充账号（旧 B端-详细测试用例.md 选补）
  ('USR_OPS_C',   'ops_c',   'test123', 'staff', 'EMP_OPS_C',  'active', NOW(), NOW()),

  -- 主管端补充账号（旧 B端-详细测试用例.md 选补）
  ('USR_ADMIN_D', 'admin_d', 'test123', 'admin', NULL, 'active', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  role = VALUES(role),
  employee_id = VALUES(employee_id),
  status = VALUES(status),
  updated_at = NOW();

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- §3. 验证查询（执行后请手动跑以下 4 个查询确认）
-- ============================================================

-- 验证 1：role 枚举已扩展（含 'academic'）
-- SHOW COLUMNS FROM users WHERE Field = 'role';

-- 验证 2：academic02 已创建
-- SELECT id, username, role, employee_id, status FROM users WHERE username = 'academic02';

-- 验证 3：test123 明文比对成功（5 个新账号）
-- SELECT username, role FROM users
-- WHERE password = 'test123' AND username IN ('academic02','sales_a','sales_b','ops_c','admin_d')
-- ORDER BY username;

-- 验证 4：role 分布（含 academic）
-- SELECT role, status, COUNT(*) AS cnt FROM users GROUP BY role, status ORDER BY role, status;

-- ============================================================
-- §4. 回滚脚本（如需删除本次新增账号，解除注释后执行）
-- ============================================================

-- DELETE FROM users WHERE username IN ('academic02','sales_a','sales_b','ops_c','admin_d');
-- DELETE FROM employees WHERE id = 'emp-academic-02';

-- 还原 role 枚举（如需回滚 ALTER）
-- ALTER TABLE users MODIFY COLUMN `role` ENUM('admin','staff','sales','owner') COLLATE utf8mb4_unicode_ci NOT NULL;

-- ============================================================
-- 文档结束
-- ============================================================
