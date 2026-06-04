-- ============================================================
-- M27: v1.3 主管手动标记优秀作品（SUP-1）
--
-- 业务来源：doc/v1.3-四端口迭代任务清单.md
--   - SUP-1: 主管端作品看板每行新增「标记优秀作品」按钮（toggle）
--           被标记的作品在运营端学习榜单的「主管推荐」板块中展示
--   - OP-10: 运营端学习榜单新增「主管推荐」板块，只展示被主管手动标记的帖子
--
-- 变更内容：
--   1. posts 表新增 is_supervisor_picked 字段（TINYINT，默认 0）
--   2. posts 表新增 supervisor_picked_by 字段（标记人用户ID，可空）
--   3. posts 表新增 supervisor_picked_at 字段（标记时间，可空）
--   4. 新增 idx_posts_supervisor_picked 索引，加速"主管推荐"板块按此字段过滤
--
-- 幂等：所有 ALTER 使用 IF NOT EXISTS / DROP COLUMN IF EXISTS 兼容 MySQL 8.0+
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. posts 表新增主管标记字段
--   is_supervisor_picked = 0 普通作品；1 被主管手动标记为"优秀作品"
--   supervisor_picked_by 记录是谁标记的（users.id），便于"我标记的"过滤
--   supervisor_picked_at 记录标记时间，便于运营端按时间倒序展示
-- ============================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_supervisor_picked TINYINT NOT NULL DEFAULT 0
  COMMENT '是否被主管标记为优秀作品（学习榜单主管推荐用）';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS supervisor_picked_by VARCHAR(64) NULL
  COMMENT '标记人（主管）ID';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS supervisor_picked_at DATETIME NULL
  COMMENT '标记时间';

-- ============================================================
-- 2. 索引：学习榜单"主管推荐"板块会按 is_supervisor_picked = 1 过滤并按时间倒序
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_supervisor_picked ON posts (is_supervisor_picked);

-- 同步 posts 表注释
ALTER TABLE posts COMMENT = '作品帖子表（v1.3 增量：主管标记优秀作品字段 SUP-1）';

SET FOREIGN_KEY_CHECKS = 1;
