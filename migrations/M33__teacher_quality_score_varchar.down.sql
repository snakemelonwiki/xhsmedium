-- M33 down: 还原 quality_score 为 DECIMAL(3,1)
ALTER TABLE teachers MODIFY COLUMN quality_score DECIMAL(3,1) NULL COMMENT '质量评分(0-10)';
