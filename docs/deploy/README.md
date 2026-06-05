# 部署上线 + 数据迁移 · 目录

> 本目录是为"全新 Ubuntu 22.04 服务器从零部署"准备的完整工具集。
> 你只需要按顺序跑 4 步 + 2 套验证,整套系统就能上生产。

## 推荐顺序

| # | 文档 | 脚本 | 用途 | 预计耗时 |
|---|------|------|------|----------|
| 1 | [01-install-mysql.md](01-install-mysql.md) | `scripts/install-mysql.sh` | apt 装 MySQL 8 + 改 root 密码 + 开机自启 | 3-5 分钟 |
| 2 | [02-init-database.md](02-init-database.md) | `scripts/init-database.sh` | CREATE DATABASE + 业务账号 + schema 导入 | 1-2 分钟 |
| 3 | [03-deploy-app.md](03-deploy-app.md) | `scripts/deploy-app.sh` | 拉代码 + npm install + NestJS build + Next.js build + PM2 start | 5-10 分钟 |
| 4 | [04-data-migration.md](04-data-migration.md) | `scripts/migrate-legacy-data.sh` | 从老 xhsmedium/data.json 灌进新 MySQL + uploads 拷贝 + 缩略图 + 校验 | 1-2 分钟(数据量看规模) |
| 5 | [05-nginx-https.md](05-nginx-https.md) | (无脚本,纯文档) | Nginx 反代 + Let's Encrypt HTTPS | 5-10 分钟 |
| 6 | [06-backup-restore.md](06-backup-restore.md) | `scripts/backup-db.sh` / `restore-db.sh` | crontab 每天 1 次 mysqldump + 保留 N 天 | 5 分钟配置 |

## 可选配套

- [07-troubleshooting.md](07-troubleshooting.md) — 跑挂时的 7 类常见错误(MySQL 没装、Node 版本低、权限错、端口占用、Chromium 缺依赖、xsec_token 失效、FFmpeg 缺失)

## 部署目录结构

```
docs/deploy/
├── README.md                 # 本文件
├── 01-install-mysql.md       # MySQL 8 安装步骤
├── 02-init-database.md       # 数据库/账号/schema 初始化
├── 03-deploy-app.md          # NestJS + Next.js 部署
├── 04-data-migration.md      # 数据迁移(legacy → 新库)
├── 05-nginx-https.md         # Nginx + Let's Encrypt
├── 06-backup-restore.md      # mysqldump 备份与恢复
├── 07-troubleshooting.md     # 常见问题排查
├── scripts/
│   ├── install-mysql.sh      # apt 装 MySQL + 改密码 + 开机自启
│   ├── init-database.sh      # CREATE DATABASE + 业务账号 + schema
│   ├── deploy-app.sh         # 拉代码 + npm i + build + pm2
│   ├── migrate-legacy-data.sh # 调 scripts/migrate-from-legacy.js 一键
│   ├── backup-db.sh          # mysqldump 到 /var/backups/lan-system
│   └── restore-db.sh         # 从 sql 文件恢复
├── nginx/
│   └── lan-system.conf       # Nginx 反代 + 静态资源 + 限流
└── ecosystem/
    └── ecosystem.config.js   # PM2 配置模板
```

## 服务器要求(DEPLOY_CLOUD.md 推荐)

| 资源 | 最低 | 推荐 |
|------|------|------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 2 核 | 4 核 |
| 内存 | 4GB | 8GB |
| 硬盘 | 50GB SSD | 100GB SSD |
| Node | 20 LTS | 20 LTS(`.nvmrc` 已锁) |
| MySQL | 8.0 | 8.0 |
| 端口 | 80/443 开放 | 同上 |

## 一键完成所有步骤(服务器是空的时候)

```bash
# 0) 准备:以 root 或 sudo 身份登录
sudo -i

# 1) 装 MySQL
bash docs/deploy/scripts/install-mysql.sh

# 2) 初始化数据库
bash docs/deploy/scripts/init-database.sh

# 3) 部署应用
bash docs/deploy/scripts/deploy-app.sh

# 4) (可选)从老 data.json 灌数据
bash docs/deploy/scripts/migrate-legacy-data.sh

# 5) Nginx + HTTPS — 走文档 05(需要先有域名 + DNS)
```

跑完上面 4 个 shell + 文档 05 配完 Nginx,就上线了。

## 已部署环境二次更新(只更新代码,不丢数据)

```bash
cd /var/www/lan-system
git pull                        # 拉新代码
bash docs/deploy/scripts/deploy-app.sh   # 重装依赖 + 重新 build + pm2 reload
```

数据层(数据库、上传目录)不动。
