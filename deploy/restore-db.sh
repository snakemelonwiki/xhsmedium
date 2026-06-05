#!/usr/bin/env bash
# restore-db.sh — 从 gzip sql 恢复
#
# 用法:
#   sudo MYSQL_PASSWORD='xxx' bash restore-db.sh /var/backups/lan-system/db/lan_dual_role_system_20260601-030000.sql.gz
#
# 行为:
#   1) 解压(如果是 .gz)
#   2) 停 PM2
#   3) 提示二次确认(防误操作)
#   4) DROP + CREATE DATABASE + 灌入
#   5) 启回 PM2

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 用 root 或 sudo 跑"
  exit 1
fi

BACKUP_FILE="${1:?✗ 用法: $0 /path/to/backup.sql.gz}"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "✗ 文件不存在: ${BACKUP_FILE}"
  exit 2
fi

# 配置
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?✗ 必须设 MYSQL_PASSWORD}"
MYSQL_DATABASE="${MYSQL_DATABASE:-lan_dual_role_system}"
MYSQL_APP_USER="${MYSQL_APP_USER:-lan_system_user}"

# 停 PM2
echo "[$(date -Iseconds)] 停 PM2..."
pm2 stop lan-system 2>/dev/null || true

# 二次确认
echo ""
echo "即将恢复:"
echo "  文件: ${BACKUP_FILE}"
echo "  目标: ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
echo "  ⚠ 当前数据库会被 DROP 然后重建"
echo ""
read -p "确认恢复? 输入 YES 继续: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "✗ 用户取消"
  pm2 start lan-system 2>/dev/null || true
  exit 0
fi

# 解压 + 灌入
echo "[$(date -Iseconds)] DROP + CREATE + IMPORT..."
SQL_FILE="${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  SQL_FILE="$(mktemp --suffix=.sql)"
  gunzip -c "${BACKUP_FILE}" > "${SQL_FILE}"
fi

MYSQL_PWD="${MYSQL_PASSWORD}" mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" -e "
DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`;
CREATE DATABASE \`${MYSQL_DATABASE}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
"
MYSQL_PWD="${MYSQL_PASSWORD}" mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" "${MYSQL_DATABASE}" < "${SQL_FILE}"

# 业务账号要重新建(因为 mysqldump 不带 CREATE USER)
MYSQL_PWD="${MYSQL_PASSWORD}" mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}" -e "
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'${MYSQL_HOST}' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_APP_USER}'@'${MYSQL_HOST}';
FLUSH PRIVILEGES;
" 2>/dev/null || true

if [[ "${BACKUP_FILE}" == *.gz ]]; then
  rm -f "${SQL_FILE}"
fi

# 启 PM2
echo "[$(date -Iseconds)] 启 PM2..."
pm2 start lan-system

echo ""
echo "============================================================"
echo "✓ 恢复完成"
echo "  ${MYSQL_DATABASE} 已从 ${BACKUP_FILE} 恢复"
echo "============================================================"
