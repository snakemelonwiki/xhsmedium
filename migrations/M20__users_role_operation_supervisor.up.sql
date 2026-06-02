USE lan_dual_role_system;

-- M20: users.role 扩展枚举
--     旧 enum: ('admin','staff','owner','sales','academic')
--     新 enum: ('admin','staff','owner','sales','academic','operation','supervisor')
--     原因：文档 1.2 §10.1 要求独立 operation / supervisor 角色
--           - operation 运营员工（新拆出，与 staff 等价但语义清晰）
--           - supervisor 主管（与 admin 等价但语义清晰）
--     旧值保留：现有 admin/staff/owner/sales/academic 账号不变

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','staff','owner','sales','academic','operation','supervisor') NOT NULL
         COMMENT '角色：admin/supervisor主管 | staff/operation运营员工 | owner总后台 | sales销售 | academic教务';
