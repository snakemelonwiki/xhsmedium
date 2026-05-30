#!/usr/bin/env bash
# 运营中台 一键启动 (Linux / macOS / Git Bash)

set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  运营中台 一键启动"
echo "============================================"
echo

# 1) Node 检测
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node 18 或更高版本"
  echo "        https://nodejs.org/"
  exit 1
fi
echo "[Node] $(node -v)"

# 2) .env 检测
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[警告] 已从 .env.example 生成 .env"
    echo "        请打开 .env 填写 MYSQL_PASSWORD 后再次运行本脚本"
    exit 1
  else
    echo "[错误] 缺少 .env 且 .env.example 也不存在"
    exit 1
  fi
fi

if [ ! -f backend/.env ]; then
  if [ -f backend/.env.example ]; then
    cp backend/.env.example backend/.env
    echo "[警告] 已从 backend/.env.example 生成 backend/.env"
    echo "        请打开 backend/.env 填写 MYSQL_PASSWORD 和 JWT_SECRET 后再次运行"
    exit 1
  else
    echo "[错误] 缺少 backend/.env 且 backend/.env.example 也不存在"
    exit 1
  fi
fi

# 3) 依赖
if [ ! -d node_modules ]; then
  echo "[步骤 1/3] 安装根目录依赖..."
  npm install
else
  echo "[步骤 1/3] 根目录依赖已就绪"
fi

if [ ! -d backend/node_modules ]; then
  echo "[步骤 2/3] 安装 backend 依赖..."
  (cd backend && npm install)
else
  echo "[步骤 2/3] backend 依赖已就绪"
fi

# 4) 启动
echo "[步骤 3/3] 启动服务..."
echo
echo "  前端 / 员工 / 销售入口 : http://localhost:3002"
echo "  总后台入口            : http://localhost:3001"
echo "  NestJS API            : http://localhost:8089/api/*"
echo
echo "  Ctrl+C 即可停止服务"
echo "============================================"
echo

exec npm start
