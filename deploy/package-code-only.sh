#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_NAME="${1:-lan-system-code-only.zip}"
OUTPUT_PATH="$ROOT_DIR/$OUTPUT_NAME"

cd "$ROOT_DIR"
rm -f "$OUTPUT_PATH"

zip -r "$OUTPUT_PATH" \
  public \
  deploy \
  scripts \
  package.json \
  package-lock.json \
  server.js \
  repositories.js \
  schema.sql \
  db.js \
  ecosystem.config.js \
  DEPLOY_CLOUD.md \
  MYSQL_SETUP.md \
  .env.example \
  .env.production.example \
  -x "node_modules/*" \
  -x "uploads/*" \
  -x "backups/*" \
  -x "versions/*" \
  -x "public/*.pre-*" \
  -x "public/*.corrupt-*" \
  -x "data.json" \
  -x "daily-snapshots.json" \
  -x "*.log" \
  -x ".DS_Store"

echo "代码包已生成：$OUTPUT_PATH"
echo "说明：该压缩包不包含本地 data.json、daily-snapshots.json、uploads、backups，不会用于覆盖云端业务数据。"
