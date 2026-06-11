-- M33: teachers.quality_score 从 DECIMAL(3,1) 改为 VARCHAR(16)，存储 A/B/C 评级
ALTER TABLE teachers MODIFY COLUMN quality_score VARCHAR(16) NULL COMMENT '质量评分：A/B/C';
