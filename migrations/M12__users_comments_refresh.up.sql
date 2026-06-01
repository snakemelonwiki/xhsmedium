-- M12: users 表字段注释刷新（仅改 COMMENT，不改字段类型/长度/枚举值/默认值）
-- 与 schema.sql §2 完全一致，幂等；多次执行结果相同。
USE lan_dual_role_system;

ALTER TABLE users
  MODIFY COLUMN id          VARCHAR(64)  NOT NULL
    COMMENT '用户唯一ID（UUID）',
  MODIFY COLUMN username    VARCHAR(64)  NOT NULL
    COMMENT '登录用户名（全局唯一）',
  MODIFY COLUMN password    VARCHAR(255) NOT NULL
    COMMENT '登录密码：bcrypt hash 或历史明文',
  MODIFY COLUMN role        ENUM('admin','staff','owner','sales','academic') NOT NULL
    COMMENT '账号角色：admin主管端 | staff运营员工 | owner总后台 | sales销售 | academic教务',
  MODIFY COLUMN employee_id VARCHAR(64)  NULL
    COMMENT '关联员工ID（employees.id）；owner 等纯账号可为空',
  MODIFY COLUMN status      VARCHAR(32)  NOT NULL DEFAULT 'active'
    COMMENT '账号状态：active正常 | inactive停用 | locked锁定',
  MODIFY COLUMN created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    COMMENT '账号创建时间',
  MODIFY COLUMN updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    COMMENT '账号最后更新时间',
  COMMENT '系统用户账号表（按 role 区分前端入口与数据范围）';
