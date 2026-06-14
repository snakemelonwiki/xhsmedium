-- M37__a_4_a_5_fields.up.sql
-- 中台优化 A-4 / A-5 新增字段
-- 2026-06-14

-- A-5: order_submissions 增加 type 字段（regular/backup）
ALTER TABLE order_submissions
  ADD COLUMN `type` VARCHAR(16) NOT NULL DEFAULT 'regular' COMMENT '投稿类型：regular 正常投稿 / backup 备用投稿' AFTER `submit_time`;

-- 迁移历史数据：现有记录全部设为 regular
UPDATE order_submissions SET `type` = 'regular' WHERE `type` IS NULL OR `type` = '';

-- 替换唯一索引：旧索引 (order_id, submission_no) 不含 type，会阻止备用投稿与正常投稿使用相同序号
-- 使用 MySQL 8.0 兼容的 DROP INDEX IF EXISTS 语法（通过存储过程模拟，防止新安装库上执行失败）
SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'order_submissions' AND index_name = 'uk_order_submissions_order_no');
SET @drop_stmt = IF(@index_exists > 0, 'DROP INDEX `uk_order_submissions_order_no` ON `order_submissions`', 'SELECT 1');
PREPARE stmt FROM @drop_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE UNIQUE INDEX `uk_order_submissions_order_no_type` ON `order_submissions` (`order_id`, `submission_no`, `type`);

-- 更新表注释，反映 type 字段新增
ALTER TABLE order_submissions COMMENT = '订单投稿信息表（一稿一投/两稿两投/三稿三投；A-5 新增 type regular/backup 区分）';
ALTER TABLE orders COMMENT = '订单表（v1.3 增量：M26 订单编号 + M28 产品/保障/付款阶段 业务字段；A-5 新增 academic_remark 教务备注；教务端字段扩展：客户基础/作者邮箱/老师派单/审核/阶段/查稿/风险）';

-- A-4: teachers 表新增字段
ALTER TABLE teachers
  ADD COLUMN `school` VARCHAR(128) DEFAULT NULL COMMENT '学校/单位' AFTER `name`,
  ADD COLUMN `education` VARCHAR(16) DEFAULT NULL COMMENT '学历：专科/本科/硕士/博士/其他' AFTER `school`,
  ADD COLUMN `research_area` VARCHAR(255) DEFAULT NULL COMMENT '研究领域/研究方向' AFTER `education`,
  ADD COLUMN `tutoring_type` VARCHAR(16) DEFAULT NULL COMMENT '辅导类型：辅导/全流程/都可' AFTER `direction`,
  ADD COLUMN `image_url` VARCHAR(500) DEFAULT NULL COMMENT '老师头像/图片 URL' AFTER `tutoring_type`,
  ADD COLUMN `quality_level` VARCHAR(8) DEFAULT NULL COMMENT '质量等级（A-4 规范）：优秀/一般/差' AFTER `quality_score`;

-- A-5: orders 表增加 academic_remark 教务备注字段
ALTER TABLE orders
  ADD COLUMN `academic_remark` TEXT DEFAULT NULL COMMENT '教务备注（A-5 新增）' AFTER `supervisor_note`;

-- A-6: users 表 role 枚举增加 academic_supervisor
ALTER TABLE users MODIFY COLUMN `role` ENUM(
  'admin', 'staff', 'owner', 'sales', 'academic',
  'operation', 'supervisor', 'academic_supervisor'
) NOT NULL COMMENT '账号角色：admin/supervisor主管 | staff/operation运营员工 | owner总后台 | sales销售 | academic教务 | academic_supervisor教务主管';
