#!/usr/bin/env bash
# init-database.sh — 创建业务数据库 + 业务账号 + 导入 schema
#
# 用法:
#   sudo MYSQL_ROOT_PASSWORD='xxx' \
#        APP_DB_NAME=lan_dual_role_system \
#        APP_DB_USER=lan_system_user \
#        APP_DB_PASSWORD='change_this_in_env' \
#        bash init-database.sh
#
# 完成后:
#   - 业务库 ${APP_DB_NAME} 创建好,字符集 utf8mb4
#   - 业务账号 ${APP_DB_USER}@127.0.0.1 创建,密码 ${APP_DB_PASSWORD}
#   - 全部权限给业务账号
#   - schema.sql 全部表导入
#
# 注意:schema.sql 在 /var/www/lan-system/schema.sql,需要先 git clone 代码

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 请用 root 或 sudo 跑本脚本"
  exit 1
fi

# 参数(可由环境变量覆盖)
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:?✗ 必须设 MYSQL_ROOT_PASSWORD}"
APP_DB_NAME="${APP_DB_NAME:-lan_dual_role_system}"
APP_DB_USER="${APP_DB_USER:-lan_system_user}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:?✗ 必须设 APP_DB_PASSWORD}"
APP_DB_HOST="${APP_DB_HOST:-127.0.0.1}"

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/lan-system}"
SCHEMA_FILE="${SCHEMA_FILE:-${PROJECT_ROOT}/schema.sql}"

# 工具:用 root 跑 SQL
run_sql() {
  MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -h "${APP_DB_HOST}" -u root "$@"
}

echo "=== 步骤 1/4: 验证 schema.sql 存在 ==="
if [ ! -f "${SCHEMA_FILE}" ]; then
  echo "✗ 找不到 ${SCHEMA_FILE}"
  echo "  请先 git clone 项目到 ${PROJECT_ROOT}"
  echo "  或设 SCHEMA_FILE=/path/to/schema.sql 指向正确路径"
  exit 2
fi
echo "  ✓ ${SCHEMA_FILE}"

echo "=== 步骤 2/4: 创建业务数据库 ==="
run_sql -e "CREATE DATABASE IF NOT EXISTS \`${APP_DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "  ✓ ${APP_DB_NAME}"

echo "=== 步骤 3/4: 创建业务账号 + 赋权 ==="
# 先尝试删除同名的旧账号,确保幂等
run_sql -e "
DROP USER IF EXISTS '${APP_DB_USER}'@'${APP_DB_HOST}';
CREATE USER '${APP_DB_USER}'@'${APP_DB_HOST}' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${APP_DB_NAME}\`.* TO '${APP_DB_USER}'@'${APP_DB_HOST}';
FLUSH PRIVILEGES;
"
echo "  ✓ ${APP_DB_USER}@${APP_DB_HOST}"

echo "=== 步骤 4/4: 导入 schema.sql ==="
run_sql "${APP_DB_NAME}" < "${SCHEMA_FILE}"
echo "  ✓ schema 导入"

# 校验
echo ""
echo "=== 验证 ==="
run_sql -e "USE \`${APP_DB_NAME}\`; SHOW TABLES;"

echo ""
echo "============================================================"
echo "✓ 数据库初始化完成"
echo "  库:   ${APP_DB_NAME}"
echo "  账号: ${APP_DB_USER}@${APP_DB_HOST}"
echo "  密码: ${APP_DB_PASSWORD}"
echo ""
echo "  把以下写到应用 .env:"
echo "    MYSQL_HOST=${APP_DB_HOST}"
echo "    MYSQL_PORT=3306"
echo "    MYSQL_USER=${APP_DB_USER}"
echo "    MYSQL_PASSWORD=${APP_DB_PASSWORD}"
echo "    MYSQL_DATABASE=${APP_DB_NAME}"
echo "============================================================"
