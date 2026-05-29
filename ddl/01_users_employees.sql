-- ============================================================
-- DDL: users & employees tables
-- Database: lan_dual_role_system
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS lan_dual_role_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lan_dual_role_system;

-- -----------------------------------------------------------
-- employees
-- 员工表：存储员工基础信息，角色类型对应四端口体系
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_code   VARCHAR(32)   NOT NULL UNIQUE COMMENT '员工编号，唯一标识',
  name            VARCHAR(64)   NOT NULL              COMMENT '员工姓名',
  phone           VARCHAR(64)   NULL                  COMMENT '联系电话',
  department      VARCHAR(64)   NULL                  COMMENT '所属部门',
  role_type       ENUM('operations', 'sales', 'academic', 'supervisor') NOT NULL COMMENT '角色类型：运营/销售/教务/主管',
  entry_date      DATE          NULL                  COMMENT '入职日期',
  status          VARCHAR(32)   NOT NULL DEFAULT '在职' COMMENT '在职/离职/休假等',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_employees_department  (department),
  INDEX idx_employees_role_type   (role_type),
  INDEX idx_employees_status      (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工信息表';

-- -----------------------------------------------------------
-- users
-- 用户表：系统登录账号，关联员工，角色覆盖五类（四端口+管理员）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)   NOT NULL UNIQUE       COMMENT '登录用户名，唯一',
  password_hash   VARCHAR(255)  NOT NULL              COMMENT '密码哈希值',
  role            ENUM('operations', 'sales', 'academic', 'supervisor', 'admin') NOT NULL COMMENT '角色：运营/销售/教务/主管/系统管理员',
  employee_id     BIGINT        NULL                  COMMENT '关联员工ID',
  status          VARCHAR(32)   NOT NULL DEFAULT 'active' COMMENT 'active/inactive/locked',
  last_login_at   DATETIME      NULL                  COMMENT '最近登录时间',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_username       (username),
  INDEX idx_users_role           (role),
  INDEX idx_users_status         (status),
  INDEX idx_users_employee_id    (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户账号表';