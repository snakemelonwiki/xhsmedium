#!/usr/bin/env bash
# backup-db.sh — mysqldump 整个业务库,gzip 压缩,保留 14 天
#
# 安装:见 06-backup-restore.md

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 用 root 或 sudo 跑"
  exit 1
fi

# 配置(可由 env 覆盖)
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:?✗ 必须设 MYSQL_PASSWORD}"
MYSQL_DATABASE="${MYSQL_DATABASE:-lan_dual_role_system}"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/lan-system}"
BACKUP_DIR="${BACKUP_ROOT}/db"
KEEP_DAYS="${KEEP_DAYS:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/${MYSQL_DATABASE}_${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] backup ${MYSQL_DATABASE} → ${OUT}"
MYSQL_PWD="${MYSQL_PASSWORD}" mysqldump \
  --host="${MYSQL_HOST}" \
  --port="${MYSQL_PORT}" \
  --user="${MYSQL_USER}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --quick \
  --lock-tables=false \
  "${MYSQL_DATABASE}" | gzip -9 > "${OUT}"

# 验证 gzip 完整性
if ! gzip -t "${OUT}" >/dev/null 2>&1; then
  echo "  ✗ 备份文件 gzip 校验失败,删除: ${OUT}"
  rm -f "${OUT}"
  exit 1
fi
echo "  ✓ $(du -h "${OUT}" | cut -f1)  校验通过"

# 清理过期
DELETED=$(find "${BACKUP_DIR}" -name "${MYSQL_DATABASE}_*.sql.gz" -mtime +${KEEP_DAYS} -delete -print | wc -l)
echo "  ⊘ 清理 ${KEEP_DAYS} 天前备份: ${DELETED} 个"

echo "[$(date -Iseconds)] done"
