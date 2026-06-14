-- M37__a_4_a_5_fields.down.sql
-- Rollback

-- A-6: 退回旧 role 枚举前，先将 academic_supervisor 账号转为 academic
UPDATE users SET role = 'academic' WHERE role = 'academic_supervisor';
ALTER TABLE users MODIFY COLUMN `role` ENUM(
  'admin', 'staff', 'owner', 'sales', 'academic',
  'operation', 'supervisor'
) NOT NULL COMMENT '账号角色：admin/supervisor主管 | staff/operation运营员工 | owner总后台 | sales销售 | academic教务';

-- A-4: 移除 teachers 表新增字段
ALTER TABLE teachers
  DROP COLUMN IF EXISTS `quality_level`,
  DROP COLUMN IF EXISTS `image_url`,
  DROP COLUMN IF EXISTS `tutoring_type`,
  DROP COLUMN IF EXISTS `research_area`,
  DROP COLUMN IF EXISTS `education`,
  DROP COLUMN IF EXISTS `school`;

-- A-5: 移除 orders academic_remark 字段
ALTER TABLE orders DROP COLUMN IF EXISTS `academic_remark`;

-- A-5: 恢复旧唯一索引，再移除 type 字段
DROP INDEX `uk_order_submissions_order_no_type` ON `order_submissions`;
CREATE UNIQUE INDEX `uk_order_submissions_order_no` ON `order_submissions` (`order_id`, `submission_no`);
ALTER TABLE order_submissions DROP COLUMN IF EXISTS `type`;
