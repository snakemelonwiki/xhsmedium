-- ============================================================
-- B 端 1.2 P1 修复：登录失败计数 + 锁定
-- 编写日期: 2026-06-02
-- 适用: xhsmedium-dev 本地 MySQL 8.0 (lan_dual_role_system)
-- 背景: TC-PERM-004「错误密码 5 次锁定」当前 status='active'，无锁定
--       修复：在 users 表增加 failed_login_count + last_failed_at 字段
--       auth.service.ts 登录失败 5 次后 status='locked'，登录成功重置
--
-- 重入: 使用 information_schema 兜底
-- 回滚: ALTER TABLE users DROP COLUMN failed_login_count / last_failed_at;
-- ============================================================

SET NAMES utf8mb4;

-- 1. 增加 failed_login_count 列（默认 0）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'failed_login_count'
);
SET @ddl = IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `failed_login_count` INT NOT NULL DEFAULT 0 COMMENT ''连续登录失败次数：>= 5 触发锁定并 status=locked''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 增加 last_failed_at 列（可空）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_failed_at'
);
SET @ddl = IF(
  @col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `last_failed_at` DATETIME NULL COMMENT ''最近一次登录失败时间（UTC），成功登录后置 NULL''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 验证
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('failed_login_count', 'last_failed_at', 'status')
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 文档结束
-- ============================================================
