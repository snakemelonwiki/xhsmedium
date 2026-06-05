#!/usr/bin/env bash
# migrate-legacy-data.sh — 从老 xhsmedium/data.json 一键灌进新库
#
# 适用:把旧版本(Express + JSON 文件)的数据迁移到新版本(NestJS + MySQL)
#
# 用法(以 root 或有 PROJECT_ROOT 写权限的账号):
#   sudo LEGACY_DATA_DIR=/var/old-lan-system/data \
#        bash migrate-legacy-data.sh
#
# 行为:
#   1) 验证 backend/.env 存在(从中读 MYSQL_* 变量)
#   2) 验证 LEGACY_DATA_DIR/data.json 存在
#   3) 调根目录的 scripts/migrate-from-legacy.js:
#      - 写 5 张表(employees/users/accounts/posts/leads)
#      - 拷贝 uploads/(老 xhsmedium/uploads → 新 xhsmedium-dev/uploads)
#      - 业务关系校验(A-F 6 类)
#      - post_metrics_history.leads_count 回填
#   4) 跑 backfill-post-cover-thumbs.js(ffmpeg 缩略图)

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/lan-system}"
LEGACY_DATA_DIR="${LEGACY_DATA_DIR:?✗ 必须设 LEGACY_DATA_DIR(老项目根目录,含 data.json + uploads/)}"

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "✗ 找不到新项目目录: $PROJECT_ROOT"
  echo "  请先跑 deploy-app.sh"
  exit 2
fi
cd "$PROJECT_ROOT"

if [ ! -f "${LEGACY_DATA_DIR}/data.json" ]; then
  echo "✗ 找不到 ${LEGACY_DATA_DIR}/data.json"
  echo "  LEGACY_DATA_DIR 应指向老 xhsmedium 项目根(含 data.json + uploads/ 子目录)"
  exit 2
fi
echo "  ✓ 老数据: ${LEGACY_DATA_DIR}/data.json"

if [ ! -f "${PROJECT_ROOT}/backend/.env" ]; then
  echo "✗ 找不到 ${PROJECT_ROOT}/backend/.env"
  echo "  请先跑 init-database.sh,然后写 .env"
  exit 2
fi
echo "  ✓ .env: ${PROJECT_ROOT}/backend/.env"

echo "=== 步骤 1/3: 调迁移脚本(数据 + uploads + 校验 + 回填)==="
node scripts/migrate-from-legacy.js --source="${LEGACY_DATA_DIR}"

echo "=== 步骤 2/3: 生成封面缩略图(用 ffmpeg)==="
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "  装 ffmpeg..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg
fi
node scripts/backfill-post-cover-thumbs.js --write

echo "=== 步骤 3/3: PM2 reload(让应用重读数据)==="
pm2 reload lan-system 2>/dev/null || pm2 startOrReload ecosystem.config.js

echo ""
echo "============================================================"
echo "✓ 数据迁移完成"
echo "  数据已落库,uploads 已拷贝,缩略图已生成"
echo ""
echo "  校验查询:"
echo "    SELECT COUNT(*) FROM employees;    -- 应 ≥ 老 data.json 的数量"
echo "    SELECT COUNT(*) FROM posts;"
echo "    SELECT COUNT(*) FROM leads;"
echo "    SELECT COUNT(*) FROM posts WHERE cover_thumb_url IS NOT NULL;"
echo "============================================================"
