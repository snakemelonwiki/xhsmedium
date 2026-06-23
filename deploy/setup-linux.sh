#!/usr/bin/env bash
# ============================================================
# setup-linux.sh — Linux 一键部署脚本（Ubuntu 20.04+ / Debian 11+）
#
# 功能:
#   1. 安装系统依赖（Xvfb、Chromium 运行库、MySQL、Nginx）
#   2. 安装 Node.js 20（如未安装）
#   3. 安装 Playwright Chromium 浏览器
#   4. 配置 Xvfb 虚拟帧缓冲（抖音有头模式必需）
#   5. npm install + 编译 backend / frontend
#   6. 初始化数据库（可选）
#   7. PM2 启动 + systemd 开机自启
#   8. Nginx 反代配置（可选）
#
# 用法:
#   sudo bash deploy/setup-linux.sh              # 完整部署
#   sudo bash deploy/setup-linux.sh --skip-db    # 跳过数据库初始化
#   sudo bash deploy/setup-linux.sh --skip-nginx # 跳过 Nginx 配置
#   sudo bash deploy/setup-linux.sh --only-deps  # 只装系统依赖（不编译不启动）
#
# 环境变量（可在 .env 中覆盖）:
#   PROJECT_ROOT   项目目录，默认 /opt/lan-system
#   APP_USER       运行账号，默认 www-data
#   MYSQL_ROOT_PW  MySQL root 密码（首次安装时设置）
#   DB_NAME        数据库名，默认 lan_system
#   DB_USER        数据库用户，默认 lan_user
#   DB_PASSWORD    数据库密码
# ============================================================

set -euo pipefail

# ── 颜色输出 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}ℹ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
fail()  { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── 参数解析 ──
SKIP_DB=false
SKIP_NGINX=false
ONLY_DEPS=false
for arg in "$@"; do
  case "$arg" in
    --skip-db)    SKIP_DB=true ;;
    --skip-nginx) SKIP_NGINX=true ;;
    --only-deps)  ONLY_DEPS=true ;;
    --help|-h)
      echo "用法: sudo bash deploy/setup-linux.sh [--skip-db] [--skip-nginx] [--only-deps]"
      exit 0
      ;;
  esac
done

# ── 权限检查 ──
if [ "$(id -u)" -ne 0 ]; then
  fail "请用 root 或 sudo 运行此脚本"
fi

# ── 变量 ──
PROJECT_ROOT="${PROJECT_ROOT:-/opt/lan-system}"
APP_USER="${APP_USER:-www-data}"
APP_PORT="${APP_PORT:-3000}"
OWNER_PORT="${OWNER_PORT:-3001}"
ALL_ROLES_PORT="${ALL_ROLES_PORT:-3003}"
NEST_PORT="${NEST_PORT:-8089}"
NEXT_PORT="${NEXT_PORT:-3302}"
NODE_VERSION_REQUIRED="20"
XVFB_DISPLAY=":99"
DB_NAME="${DB_NAME:-lan_system}"
DB_USER="${DB_USER:-lan_user}"
DB_PASSWORD="${DB_PASSWORD:-}"

info "项目目录: $PROJECT_ROOT"
info "运行账号: $APP_USER"
info "端口: legacy=$APP_PORT / owner=$OWNER_PORT / unified=$ALL_ROLES_PORT / nest=$NEST_PORT / next=$NEXT_PORT"

# ============================================================
# 步骤 1: 系统依赖
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 1/8: 安装系统依赖"
echo "═══════════════════════════════════════════════════════"

apt-get update -qq

# 基础工具 + Xvfb + Chromium 运行库 + sharp 依赖
DEPS=(
  # 基础
  curl wget git unzip ca-certificates
  # Xvfb 虚拟帧缓冲（抖音有头模式必需）
  xvfb
  # Chromium / Playwright 运行库
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2
  libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1
  libgtk-3-0 libdbus-glib-1-2 libx11-xcb1
  # sharp (图片处理) 依赖
  libvips-dev
  # ffmpeg（封面缩略图生成）
  ffmpeg
  # MySQL
  mysql-server mysql-client
  # Nginx
  nginx
)

info "安装 ${#DEPS[@]} 个包..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${DEPS[@]}" > /dev/null 2>&1
ok "系统依赖安装完成"

# ============================================================
# 步骤 2: Node.js 20
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 2/8: 检查 Node.js"
echo "═══════════════════════════════════════════════════════"

NODE_CURRENT="$(node -v 2>/dev/null | sed 's/^v//' || echo '0')"
NODE_MAJOR="$(echo "$NODE_CURRENT" | cut -d. -f1)"

if [ "$NODE_MAJOR" != "$NODE_VERSION_REQUIRED" ]; then
  info "当前 Node v$NODE_CURRENT, 安装 v${NODE_VERSION_REQUIRED}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION_REQUIRED}.x" | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  ok "Node.js $(node -v) 已安装"
else
  ok "Node.js v$NODE_CURRENT 已就绪"
fi

# 确保 npm 可用
npm --version > /dev/null 2>&1 || fail "npm 不可用"

# ============================================================
# 步骤 3: 项目目录 + 代码
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 3/8: 项目目录"
echo "═══════════════════════════════════════════════════════"

# 如果是从仓库内运行脚本，复制到 PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$SCRIPT_DIR" != "$PROJECT_ROOT" ] && [ ! -d "$PROJECT_ROOT/.git" ]; then
  info "复制项目到 $PROJECT_ROOT ..."
  mkdir -p "$PROJECT_ROOT"
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
    --exclude='backend/dist' --exclude='.playwright-profiles' \
    "$SCRIPT_DIR/" "$PROJECT_ROOT/"
  ok "代码已复制"
fi

if [ ! -d "$PROJECT_ROOT" ]; then
  fail "项目目录不存在: $PROJECT_ROOT（请先 git clone 或设置 PROJECT_ROOT 环境变量）"
fi

cd "$PROJECT_ROOT"

# 创建必要目录
mkdir -p uploads/post-covers/thumbs backups .playwright-profiles

# 修复 Windows → Linux 的 CRLF 换行符（否则 shebang 行无法执行）
if command -v dos2unix &> /dev/null; then
  find . -maxdepth 1 -name "*.sh" -exec dos2unix {} + 2>/dev/null || true
  find scripts -name "*.js" -exec dos2unix {} + 2>/dev/null || true
  find deploy -name "*.sh" -exec dos2unix {} + 2>/dev/null || true
else
  # 用 sed 兜底：去掉 \r
  find . -maxdepth 1 -name "*.sh" -exec sed -i 's/\r$//' {} + 2>/dev/null || true
  find scripts -name "*.js" -exec sed -i 's/\r$//' {} + 2>/dev/null || true
  find deploy -name "*.sh" -exec sed -i 's/\r$//' {} + 2>/dev/null || true
fi

# 修复脚本执行权限
chmod +x deploy/*.sh scripts/*.js 2>/dev/null || true

# 修复 uploads 目录权限（确保 APP_USER 可写）
chown -R "$APP_USER:$APP_USER" uploads/ backups/ .playwright-profiles/ 2>/dev/null || true
chmod -R 775 uploads/ backups/ .playwright-profiles/ 2>/dev/null || true

# .env 文件
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  warn ".env 已从 .env.example 创建，请检查数据库密码等配置"
fi

ok "项目目录就绪: $PROJECT_ROOT"

# ============================================================
# 步骤 4: npm install + 编译
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 4/8: 安装依赖 + 编译"
echo "═══════════════════════════════════════════════════════"

if $ONLY_DEPS; then
  info "--only-deps 模式，跳过编译"
else
  info "安装根目录依赖..."
  npm install --production=false 2>&1 | tail -1

  info "安装 backend 依赖..."
  (cd backend && npm install --production=false 2>&1 | tail -1)

  info "编译 backend..."
  (cd backend && npm run build 2>&1 | tail -1)
  ok "backend/dist/ 已生成"

  info "安装 frontend 依赖..."
  (cd frontend && npm install --production=false 2>&1 | tail -1)

  info "编译 frontend..."
  (cd frontend && npm run build 2>&1 | tail -3)
  ok "frontend/.next/ 已生成"
fi

# ============================================================
# 步骤 5: Playwright Chromium + Xvfb
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 5/8: Playwright Chromium + Xvfb"
echo "═══════════════════════════════════════════════════════"

# Playwright 浏览器安装目录
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/root/.cache/ms-playwright}"

if [ ! -d "$PLAYWRIGHT_BROWSERS_PATH" ] || [ -z "$(ls -A "$PLAYWRIGHT_BROWSERS_PATH" 2>/dev/null)" ]; then
  info "安装 Playwright Chromium（首次约 2-5 分钟）..."
  npx playwright install --with-deps chromium 2>&1 | tail -3
  ok "Playwright Chromium 已安装"
else
  ok "Playwright Chromium 已存在: $PLAYWRIGHT_BROWSERS_PATH"
fi

# Xvfb systemd 服务（确保开机自启 + 进程管理）
XVFB_SERVICE="/etc/systemd/system/xvfb.service"
if [ ! -f "$XVFB_SERVICE" ]; then
  info "创建 Xvfb systemd 服务..."
  cat > "$XVFB_SERVICE" <<'EOF'
[Unit]
Description=Xvfb Virtual Framebuffer for Playwright headful mode
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac -nolisten tcp
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable xvfb
  systemctl start xvfb
  ok "Xvfb 服务已启动（display $XVFB_SERVICE）"
else
  # 确保运行中
  if ! systemctl is-active --quiet xvfb; then
    systemctl start xvfb
  fi
  ok "Xvfb 服务已存在且运行中"
fi

# 设置 DISPLAY 环境变量（持久化）
if ! grep -q "DISPLAY=$XVFB_DISPLAY" /etc/environment 2>/dev/null; then
  echo "DISPLAY=$XVFB_DISPLAY" >> /etc/environment
  info "已将 DISPLAY=$XVFB_DISPLAY 写入 /etc/environment"
fi
export DISPLAY="$XVFB_DISPLAY"

ok "抖音有头模式环境就绪（DISPLAY=$XVFB_DISPLAY）"

# ============================================================
# 步骤 6: MySQL 数据库
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 6/8: MySQL 数据库"
echo "═══════════════════════════════════════════════════════"

if $SKIP_DB; then
  info "--skip-db 模式，跳过数据库初始化"
else
  # 确保 MySQL 运行
  if ! systemctl is-active --quiet mysql 2>/dev/null && ! systemctl is-active --quiet mysqld 2>/dev/null; then
    systemctl start mysql 2>/dev/null || systemctl start mysqld 2>/dev/null || true
  fi

  # 检查数据库是否已存在
  DB_EXISTS=$(mysql -N -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='$DB_NAME'" 2>/dev/null || echo "")

  if [ -z "$DB_EXISTS" ]; then
    info "创建数据库 $DB_NAME ..."

    # 如果有 MYSQL_ROOT_PW，用它；否则尝试无密码
    if [ -n "${MYSQL_ROOT_PW:-}" ]; then
      MYSQL_CMD="mysql -u root -p${MYSQL_ROOT_PW}"
    else
      MYSQL_CMD="mysql -u root"
    fi

    $MYSQL_CMD <<EOSQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOSQL

    # 创建用户（如果指定了密码）
    if [ -n "$DB_PASSWORD" ]; then
      $MYSQL_CMD <<EOSQL
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOSQL
      ok "数据库用户 $DB_USER 已创建"
    fi

    # 导入 schema
    if [ -f schema.sql ]; then
      info "导入 schema.sql ..."
      $MYSQL_CMD "$DB_NAME" < schema.sql
      ok "数据库 schema 已导入"
    else
      warn "schema.sql 不存在，跳过 schema 导入"
    fi

    # 导入 schemav2（如果存在）
    if [ -f schemav2.sql ]; then
      info "导入 schemav2.sql ..."
      $MYSQL_CMD "$DB_NAME" < schemav2.sql 2>/dev/null || true
    fi

    ok "数据库 $DB_NAME 已创建"
  else
    ok "数据库 $DB_NAME 已存在，跳过创建"
  fi

  # 运行迁移脚本
  if [ -f deploy/run-migrations.js ]; then
    info "运行数据库迁移..."
    node deploy/run-migrations.js 2>/dev/null || warn "迁移脚本执行失败（可能已执行过）"
  fi
fi

# ============================================================
# 步骤 7: PM2 启动
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 7/8: PM2 启动应用"
echo "═══════════════════════════════════════════════════════"

if $ONLY_DEPS; then
  info "--only-deps 模式，跳过 PM2 启动"
else
  # 安装 PM2
  if ! command -v pm2 &> /dev/null; then
    info "安装 PM2..."
    npm install -g pm2
    ok "PM2 已安装"
  fi

  # 更新 ecosystem.config.js 中的 cwd
  if [ -f ecosystem.config.js ]; then
    # 替换 cwd 路径
    sed -i "s|cwd: \".*backend\"|cwd: \"$PROJECT_ROOT/backend\"|g" ecosystem.config.js
    sed -i "s|cwd: \".*frontend\"|cwd: \"$PROJECT_ROOT/frontend\"|g" ecosystem.config.js
  fi

  # 更新 .env 中的数据库配置
  if [ -f .env ] && [ -n "$DB_PASSWORD" ]; then
    sed -i "s|^DB_HOST=.*|DB_HOST=localhost|" .env 2>/dev/null || true
    sed -i "s|^DB_NAME=.*|DB_NAME=$DB_NAME|" .env 2>/dev/null || true
    sed -i "s|^DB_USER=.*|DB_USER=$DB_USER|" .env 2>/dev/null || true
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env 2>/dev/null || true
  fi

  # 确保旧进程停止
  pm2 delete all 2>/dev/null || true

  info "启动应用..."
  # 设置 DISPLAY 环境变量给 PM2 进程
  export PM2_NODE_OPTIONS="--max-old-space-size=1024"

  pm2 start ecosystem.config.js --env production
  pm2 save

  # PM2 开机自启
  pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>/dev/null || \
  pm2 startup systemd 2>/dev/null || true

  ok "应用已通过 PM2 启动"
  sleep 2
  pm2 list
fi

# ============================================================
# 步骤 8: Nginx 反代
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " 步骤 8/8: Nginx 反向代理"
echo "═══════════════════════════════════════════════════════"

if $SKIP_NGINX; then
  info "--skip-nginx 模式，跳过 Nginx 配置"
else
  NGINX_CONF="/etc/nginx/sites-available/lan-system"
  NGINX_ENABLED="/etc/nginx/sites-enabled/lan-system"

  if [ -f deploy/nginx.lan-system.conf ]; then
    info "配置 Nginx 反代..."
    cp deploy/nginx.lan-system.conf "$NGINX_CONF"

    # 替换端口
    sed -i "s|proxy_pass http://127.0.0.1:[0-9]*|proxy_pass http://127.0.0.1:${APP_PORT}|g" "$NGINX_CONF"

    # 启用站点
    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    # 测试并重载
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      ok "Nginx 反代已配置"
    else
      warn "Nginx 配置测试失败，请手动检查 $NGINX_CONF"
    fi
  else
    info "deploy/nginx.lan-system.conf 不存在，跳过 Nginx 配置"
  fi
fi

# ============================================================
# 部署完成
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
ok "部署完成！"
echo ""
echo "  服务端口:"
echo "    员工入口:     http://localhost:${APP_PORT}"
echo "    总后台:       http://localhost:${OWNER_PORT}"
echo "    统一登录:     http://localhost:${ALL_ROLES_PORT}"
echo "    NestJS API:  http://localhost:${NEST_PORT}"
echo "    Next.js:     http://localhost:${NEXT_PORT}"
echo ""
echo "  Playwright:"
echo "    Chromium:     $(npx playwright --version 2>/dev/null || echo 'unknown')"
echo "    DISPLAY:      $DISPLAY"
echo "    Xvfb:         $(systemctl is-active xvfb 2>/dev/null || echo 'unknown')"
echo ""
echo "  常用命令:"
echo "    pm2 list                  # 查看进程"
echo "    pm2 logs                  # 查看日志"
echo "    pm2 restart all           # 重启所有服务"
echo "    systemctl status xvfb     # 检查 Xvfb 状态"
echo ""
echo "═══════════════════════════════════════════════════════"
