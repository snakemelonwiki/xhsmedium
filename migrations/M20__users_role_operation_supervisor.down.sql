USE lan_dual_role_system;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','staff','owner','sales','academic') NOT NULL
         COMMENT '角色：admin主管端 | staff运营员工 | owner总后台 | sales销售 | academic教务';
