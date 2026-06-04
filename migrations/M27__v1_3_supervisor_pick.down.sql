-- ============================================================
-- M27 down: 回滚 v1.3 主管标记优秀作品字段
-- 警告：down 仅在开发/演练环境使用，线上回滚必须先备份
--
-- 回滚顺序与 up 相反：
--   1. 删除 idx_posts_supervisor_picked 索引
--   2. 删除 supervisor_picked_at 字段
--   3. 删除 supervisor_picked_by 字段
--   4. 删除 is_supervisor_picked 字段
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP INDEX IF EXISTS idx_posts_supervisor_picked  ON posts;

ALTER TABLE posts DROP COLUMN IF EXISTS supervisor_picked_at;
ALTER TABLE posts DROP COLUMN IF EXISTS supervisor_picked_by;
ALTER TABLE posts DROP COLUMN IF EXISTS is_supervisor_picked;

-- 恢复 posts 表注释
ALTER TABLE posts COMMENT = '作品帖子表';

SET FOREIGN_KEY_CHECKS = 1;
