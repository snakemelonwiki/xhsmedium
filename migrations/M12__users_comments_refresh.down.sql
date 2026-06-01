-- M12 回滚：把字段注释还原为 M11 之前的简注释（仅 COMMENT 变化，不改类型/枚举）
USE lan_dual_role_system;

ALTER TABLE users
  MODIFY COLUMN username    VARCHAR(64)  NOT NULL
    COMMENT '登录用户名',
  MODIFY COLUMN password    VARCHAR(255) NOT NULL
    COMMENT '登录密码或 bcrypt hash',
  MODIFY COLUMN role        ENUM('admin','staff','owner','sales','academic') NOT NULL
    COMMENT '账号角色（原 admin/staff 基础上追加 owner/sales/academic）',
  MODIFY COLUMN employee_id VARCHAR(64)  NULL
    COMMENT '关联员工ID',
  MODIFY COLUMN status      VARCHAR(32)  NOT NULL DEFAULT 'active'
    COMMENT 'active/inactive/locked',
  COMMENT '系统用户账号表';
