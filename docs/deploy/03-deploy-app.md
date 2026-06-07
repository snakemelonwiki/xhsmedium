# 步骤 3:部署应用(NestJS + Next.js)

> MySQL 装好、库初始化完,本步把应用代码、依赖、构建产物、PM2 进程都拉起来。

## 30 秒摘要

```bash
cd /var/www/lan-system    # 你的项目根
sudo bash docs/deploy/scripts/deploy-app.sh
```

`deploy-app.sh` 自动完成 7 步:
1. 验证 Node 20(`.nvmrc` 锁的)
2. `cd` 到项目根,确认 `schema.sql` 已在
3. `npm install`(根 + backend + frontend,3 套)
4. `cd backend && npm run build`(TypeScript 编译到 `dist/`)
5. `cd frontend && npm run build`(Next.js 产出 `.next/`)
6. `npx playwright install --with-deps chromium`(抓取用)
7. `pm2 startOrReload ecosystem.config.js`(启动 / reload,不丢连接)

## 可改环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PROJECT_ROOT` | `/var/www/lan-system` | 项目目录 |
| `APP_USER` | `www-data` | PM2 跑应用的用户(可选) |
| `APP_PORT` | `3000` | legacy 反代端口(给前端页面) |
| `NEST_PORT` | `8089` | NestJS API 端口 |
| `SKIP_FRONTEND` | `0` | 设为 `1` 跳过 next build(只用 legacy 模式时) |
| `SKIP_BROWSERS` | `0` | 设为 `1` 跳过 playwright 装(纯 API 场景) |

## 跑完后

- PM2 进程:`pm2 list` 看到 `lan-system` 在跑
- legacy 反代:`http://127.0.0.1:3000/`(serve 老的 `public/app.js` 单页)
- NestJS API:`http://127.0.0.1:8089/api/...`
- Next.js:`http://127.0.0.1:3302/`(新前端,如果没 SKIP_FRONTEND)

## 二次更新(已部署,只更新代码)

```bash
cd /var/www/lan-system
git pull                              # 拉新代码
sudo bash docs/deploy/scripts/deploy-app.sh
# 自动:重新 npm install + build + pm2 reload
# 数据(数据库 / uploads)不动
```

## 常见故障

| 现象 | 排查 |
|------|------|
| `Nest can't resolve dependencies` | backend/.env 缺 MYSQL_* 变量,见[步骤 2](02-init-database.md) |
| `EADDRINUSE :::3000` | 端口被占,`lsof -i :3000` 看谁占着,`kill <pid>` |
| PM2 启动后立刻 crash | `pm2 logs lan-system --lines 50` 看错误 |
| `Cannot find module 'X'` | `rm -rf node_modules && npm install` |
| Playwright 装 Chromium 慢 | 网络问题,可先 SKIP_BROWSERS=1 跳过,后续手动 `npx playwright install chromium` |
| Next.js build OOM | 内存不够,临时 `NODE_OPTIONS=--max-old-space-size=4096 npm run build` |

## PM2 常用命令

```bash
pm2 list                          # 看进程
pm2 logs lan-system               # 实时日志
pm2 logs lan-system --lines 200   # 拉历史
pm2 restart lan-system            # 重启
pm2 reload lan-system             # 0 停机 reload
pm2 stop lan-system               # 停
pm2 delete lan-system             # 删进程(不删代码)
pm2 monit                         # 资源监控(CPU/内存)
```

## 下一步

[步骤 4:数据迁移](04-data-migration.md) — 如果有老 data.json 要灌进来。
