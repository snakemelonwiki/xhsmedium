-- ============================================================
-- M5 回滚：恢复 role ENUM 为 ('admin','staff')
-- ⚠ 若已有 owner 或 academic 数据，需先迁移到其他角色或保留宽容枚举
-- ============================================================

USE lan_dual_role_system;

-- 安全检查：若存在 owner / academic 用户，回滚会丢失角色信息
-- 建议先：UPDATE users SET role='admin' WHERE role IN ('owner','academic');

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','staff') NOT NULL;
