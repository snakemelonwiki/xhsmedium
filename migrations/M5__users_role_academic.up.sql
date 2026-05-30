-- ============================================================
-- M5: users.role 扩展枚举
--     旧 enum：('admin','staff')
--     新 enum：('admin','staff','owner','sales','academic')
--     原因：
--       - 'owner' 历史数据已存在（总后台），但旧 enum 未列出，是隐式宽容
--       - 'sales' 前端 + 部分接口在用（独立销售角色），同上
--       - 'academic' 教务端新增（方案 §2 / §10）
--     与四端口模型对齐：admin/staff(运营) | owner(总后台) | sales | academic(教务)
-- ============================================================

USE lan_dual_role_system;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','staff','owner','sales','academic') NOT NULL
         COMMENT '角色：admin运营管理 | staff运营员工 | owner总后台 | sales销售 | academic教务';
