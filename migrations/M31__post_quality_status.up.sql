-- M31: 主管作品质量状态
-- normal: 普通；excellent: 优秀作品；unqualified: 不合格作品，关联客资成单按半价入单。

ALTER TABLE posts ADD COLUMN IF NOT EXISTS supervisor_quality_status VARCHAR(16) NOT NULL DEFAULT 'normal'
  COMMENT '主管质量状态：normal/excellent/unqualified';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS supervisor_quality_marked_by VARCHAR(64) NULL
  COMMENT '最近一次标记质量状态的主管用户ID';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS supervisor_quality_marked_at DATETIME NULL
  COMMENT '最近一次标记质量状态的时间';

UPDATE posts
SET supervisor_quality_status = 'excellent'
WHERE is_supervisor_picked = 1
  AND (supervisor_quality_status IS NULL OR supervisor_quality_status = 'normal');

CREATE INDEX IF NOT EXISTS idx_posts_quality_status ON posts (supervisor_quality_status);
