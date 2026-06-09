-- M31 down: 回滚主管作品质量状态字段

DROP INDEX IF EXISTS idx_posts_quality_status ON posts;

ALTER TABLE posts DROP COLUMN IF EXISTS supervisor_quality_marked_at;
ALTER TABLE posts DROP COLUMN IF EXISTS supervisor_quality_marked_by;
ALTER TABLE posts DROP COLUMN IF EXISTS supervisor_quality_status;
