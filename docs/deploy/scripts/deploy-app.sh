#!/usr/bin/env bash
# deploy-app.sh — 拉代码 / 装依赖 / 编译 / PM2 启动
#
# 适用场景:
#   1) 全新部署:git clone 后第一次跑
#   2) 二次更新:已部署的服务器,只更新代码不丢数据
#
# 用法(以 root):
#   bash deploy-app.sh
#
# 行为:
#   1) 验证 Node 20(.nvmrc)
#   2) npm install 根 + backend + frontend
#   3) 编译 backend(nest build)+ frontend(next build)
#   4) PM2 启动 / reload
#   5) 验证 /healthz / 8089 / 3000

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 请用 root 或 sudo 跑"
  exit 1
fi

PROJECT_ROOT="${PROJECT_ROOT:-/var/www/lan-system}"
APP_USER="${APP_USER:-www-data}"   # 应用运行账号(可改 www-data/deploy/node)
APP_PORT="${APP_PORT:-3000}"        # legacy 反代端口
NEST_PORT="${NEST_PORT:-8089}"      # NestJS 端口
NODE_VERSION_REQUIRED="20"

echo "=== 步骤 1/7: 验证 Node 版本 ==="
NODE_CURRENT="$(node -v 2>/dev/null | sed 's/^v//' || echo '0')"
NODE_MAJOR="$(echo "$NODE_CURRENT" | cut -d. -f1)"
if [ "$NODE_MAJOR" != "$NODE_VERSION_REQUIRED" ]; then
  echo "✗ 当前 Node $NODE_CURRENT,要求 v${NODE_VERSION_REQUIRED}.x"
  echo "  安装方法(任选):"
  echo "    nvm install 20 && nvm use 20"
  echo "    或 apt: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && apt install -y nodejs"
  exit 2
fi
echo "  ✓ Node v$NODE_CURRENT"

echo "=== 步骤 2/7: cd 到项目根 ==="
if [ ! -d "$PROJECT_ROOT" ]; then
  echo "✗ 项目目录不存在: $PROJECT_ROOT"
  echo "  请先 git clone 到 $PROJECT_ROOT,或设 PROJECT_ROOT=..."
  exit 2
fi
cd "$PROJECT_ROOT"
echo "  ✓ $(pwd)"

echo "=== 步骤 3/7: npm install(根 + backend + frontend)==="
# 根:legacy server + 顶层 scripts
npm install
# backend
(cd backend && npm install)
# frontend
(cd frontend && npm install)

echo "=== 步骤 4/7: 编译 backend(nest build)==="
(cd backend && npm run build)
echo "  ✓ backend/dist/ 已生成"

echo "=== 步骤 5/7: 编译 frontend(next build)==="
# 如果不需要前端(比如 legacy 模式),跳过
if [ "${SKIP_FRONTEND:-0}" = "1" ]; then
  echo "  ⊘ SKIP_FRONTEND=1,跳过 next build"
else
  (cd frontend && npm run build)
  echo "  ✓ frontend/.next/ 已生成"
fi

echo "=== 步骤 6/7: 装 Playwright Chromium(首次部署需要)==="
if [ "${SKIP_BROWSERS:-0}" = "1" ]; then
  echo "  ⊘ SKIP_BROWSERS=1,跳过 playwright install"
else
  npx playwright install --with-deps chromium
fi

echo "=== 步骤 7/7: PM2 启动 / reload ==="
if ! command -v pm2 >/dev/null 2>&1; then
  echo "  装 pm2..."
  npm install -g pm2
fi

# 项目 ecosystem.config.js cwd 必须是 PROJECT_ROOT
# 如果你改了目录,编辑 ecosystem.config.js 的 cwd 字段
pm2 startOrReload ecosystem.config.js
pm2 save

# 启动 systemd 钩子(开机自启)
pm2 startup | tail -1 || true

echo ""
echo "=== 验证 ==="
sleep 3
pm2 list
echo ""
echo "健康检查:"
curl -sS -o /dev/null -w "  GET http://127.0.0.1:${NEST_PORT}/api/auth/me  → HTTP %{http_code}\n" "http://127.0.0.1:${NEST_PORT}/api/auth/me" || true
curl -sS -o /dev/null -w "  GET http://127.0.0.1:${APP_PORT}/                → HTTP %{http_code}\n" "http://127.0.0.1:${APP_PORT}/" || true

echo ""
echo "============================================================"
echo "✓ 应用部署完成"
echo "  legacy 反代: http://127.0.0.1:${APP_PORT}"
echo "  NestJS 直连: http://127.0.0.1:${NEST_PORT}"
echo ""
echo "下一步:"
echo "  bash docs/deploy/scripts/migrate-legacy-data.sh   # 如有老数据要迁"
echo "  配置 Nginx → 文档 05"
echo "============================================================"
