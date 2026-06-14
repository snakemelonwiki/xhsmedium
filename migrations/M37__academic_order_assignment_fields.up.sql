ALTER TABLE orders ADD COLUMN institution_accepted TINYINT NULL DEFAULT 0 COMMENT '机构接单：1是，0否';
ALTER TABLE orders ADD COLUMN teacher_name VARCHAR(128) NULL COMMENT '接单老师姓名';
ALTER TABLE orders ADD COLUMN teacher_wechat VARCHAR(64) NULL COMMENT '老师微信';
ALTER TABLE orders ADD COLUMN backup_teachers TEXT NULL COMMENT '备用老师数组JSON';
