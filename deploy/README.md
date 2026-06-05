# 部署脚本目录

本目录包含运营中台项目的所有部署相关脚本。

## 📦 打包脚本

### `package-code-only.sh`
生成代码包（不含业务数据和登录态）

```bash
bash deploy/package-code-only.sh [输出文件名]
```

**输出**: `lan-system-code-only.zip`（或自定义名称）

**排除内容**:
- `node_modules/` - 依赖包（需要在服务器上重新安装）
- `uploads/` - 用户上传文件
- `backups/` - 备份数据
- `data.json` / `daily-snapshots.json` - 本地数据
- `.playwright-profiles/` - 登录态
- `debug-output/` - 调试产物

## 🚀 部署脚本

### `deploy-app.sh`
完整部署应用（拉代码/装依赖/编译/启动）

```bash
# 以 root 运行
sudo bash deploy/deploy-app.sh
```

**功能**:
1. 验证 Node 20 环境
2. 安装依赖（根目录 + backend + frontend）
3. 编译 backend（NestJS）
4. 编译 frontend（Next.js）
5. 安装 Playwright Chromium
6. PM2 启动/重载

**环境变量**:
- `PROJECT_ROOT` - 项目路径（默认 `/var/www/lan-system`）
- `APP_USER` - 运行用户（默认 `www-data`）
- `APP_PORT` - Legacy 端口（默认 `3000`）
- `NEST_PORT` - NestJS 端口（默认 `8089`）
- `SKIP_FRONTEND` - 跳过前端编译（`0`/`1`）
- `SKIP_BROWSERS` - 跳过浏览器安装（`0`/`1`）

### `install-mysql.sh`
安装 MySQL 8.0

```bash
sudo bash deploy/install-mysql.sh
```

**功能**:
- 安装 MySQL 8.0
- 配置 root 密码
- 允许远程连接（可选）
- 启用自启动

### `init-database.sh`
初始化数据库和表结构

```bash
sudo bash deploy/init-database.sh
```

**功能**:
- 创建数据库 `lan_dual_role_system`
- 导入 `schema.sql` 表结构
- 插入测试用户（可选）

**环境变量**:
- `MYSQL_HOST` - 主机（默认 `127.0.0.1`）
- `MYSQL_PORT` - 端口（默认 `3306`）
- `MYSQL_USER` - 用户（默认 `root`）
- `MYSQL_PASSWORD` - 密码（**必需**）
- `MYSQL_DATABASE` - 数据库名（默认 `lan_dual_role_system`）

## 🔄 数据迁移与管理（Node.js 脚本）

### `migrate-from-legacy.js`
从旧版 data.json 一键迁移到 MySQL

```bash
# 默认从 D:/webstormProjects/xhsmedium 读取
node deploy/migrate-from-legacy.js

# 自定义源路径
node deploy/migrate-from-legacy.js --source=/path/to/old/project

# Dry-run 模式（不写库，只统计）
node deploy/migrate-from-legacy.js --dry-run

# 详细输出（逐条打印）
node deploy/migrate-from-legacy.js --verbose

# 只迁移指定表
node deploy/migrate-from-legacy.js --only=posts,leads

# 跳过 uploads/ 复制
node deploy/migrate-from-legacy.js --skip-uploads
```

**功能**:
- 从旧架构的 data.json 迁移到 MySQL（6 张表：employees/users/accounts/posts/leads/notifications）
- 复制 uploads/ 图片文件
- 幂等操作（可重复执行，跳过已存在记录）
- 自动校验业务关系完整性

**字段映射**:
- 主键原样保留（UUID）
- camelCase → snake_case
- ISO 时间 → MySQL DATETIME
- 新字段走 DB 默认值

### `run-migrations.js`
数据库迁移执行器（schema 变更管理）

```bash
# 执行所有未应用的迁移
node deploy/run-migrations.js

# 查看迁移状态
node deploy/run-migrations.js --status

# 仅执行指定迁移
node deploy/run-migrations.js --target=M1

# 回滚迁移
node deploy/run-migrations.js --down=M2
```

**功能**:
- 维护 `_migrations` 表记录迁移历史
- 扫描 `migrations/` 目录下的 `.up.sql` / `.down.sql`
- 按文件名顺序执行
- 已应用的迁移自动跳过

### `seed-demo-data.js`
生成演示数据（开发/测试环境）

```bash
node deploy/seed-demo-data.js
```

**功能**:
- 生成 data.json 和 daily-snapshots.json
- 包含完整的员工/账号/作品/客资数据
- 适用于本地开发和演示环境

### `backfill-post-cover-thumbs.js`
批量生成作品封面缩略图

```bash
# Dry-run（不写库）
node deploy/backfill-post-cover-thumbs.js

# 实际执行
node deploy/backfill-post-cover-thumbs.js --write
```

**功能**:
- 扫描 posts 表的 cover_image_url
- 使用 ffmpeg 生成 200x200 缩略图
- 更新 cover_thumb_url 字段

**前置条件**:
- 安装 ffmpeg：`sudo apt install ffmpeg`

## 💾 备份与恢复

### `backup-db.sh`
备份数据库（mysqldump + gzip）

```bash
sudo MYSQL_PASSWORD="your_password" bash deploy/backup-db.sh
```

**功能**:
- mysqldump 完整备份
- gzip 压缩
- 自动清理 14 天前的备份

**环境变量**:
- `MYSQL_PASSWORD` - 密码（**必需**）
- `BACKUP_ROOT` - 备份根目录（默认 `/var/backups/lan-system`）
- `KEEP_DAYS` - 保留天数（默认 `14`）

**输出**: `/var/backups/lan-system/db/lan_dual_role_system_YYYYMMDD-HHMMSS.sql.gz`

### `restore-db.sh`
从备份恢复数据库

```bash
sudo MYSQL_PASSWORD="your_password" bash deploy/restore-db.sh /path/to/backup.sql.gz
```

**功能**:
- 解压 gzip 备份
- 恢复到数据库
- 验证恢复完整性

### `migrate-legacy-data.sh`
迁移旧版 data.json 数据到 MySQL

```bash
sudo bash deploy/migrate-legacy-data.sh
```

**功能**:
- 读取 `data.json`
- 转换为 MySQL INSERT 语句
- 导入到数据库
- 生成迁移报告

**前置条件**:
- 已执行 `init-database.sh`
- 存在 `data.json` 文件

## 📋 使用流程

### 全新部署流程

```bash
# 1. 克隆代码
git clone <repo-url> /var/www/lan-system
cd /var/www/lan-system

# 2. 安装 MySQL
sudo bash deploy/install-mysql.sh

# 3. 初始化数据库
sudo MYSQL_PASSWORD="your_password" bash deploy/init-database.sh

# 4. 部署应用
sudo bash deploy/deploy-app.sh

# 5. （可选）迁移旧数据
sudo bash deploy/migrate-legacy-data.sh

# 6. 配置 Nginx（参考 deploy/nginx.lan-system.conf）
sudo cp deploy/nginx.lan-system.conf /etc/nginx/sites-available/lan-system
sudo ln -s /etc/nginx/sites-available/lan-system /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. 设置定时备份
sudo crontab -e
# 添加：0 3 * * * MYSQL_PASSWORD="your_password" /var/www/lan-system/deploy/backup-db.sh >> /var/log/lan-backup.log 2>&1
```

### 更新部署流程

```bash
# 1. 拉取最新代码
cd /var/www/lan-system
git pull origin main

# 2. 重新部署
sudo bash deploy/deploy-app.sh

# 3. 验证
pm2 list
curl http://localhost:3000/
```

### 数据库维护流程

```bash
# 手动备份
sudo MYSQL_PASSWORD="your_password" bash deploy/backup-db.sh

# 恢复备份
sudo MYSQL_PASSWORD="your_password" bash deploy/restore-db.sh /var/backups/lan-system/db/lan_dual_role_system_20260606-030000.sql.gz
```

## 🔧 故障排查

### 应用无法启动
```bash
pm2 logs lan-system
pm2 restart lan-system
```

### 数据库连接失败
```bash
mysql -u root -p -e "SELECT 1"
cat .env | grep MYSQL
```

### 编译失败
```bash
# 清理缓存重试
rm -rf node_modules backend/node_modules frontend/node_modules
bash deploy/deploy-app.sh
```

## 📖 详细文档

完整部署文档请参考：
- `docs/deploy/01-infrastructure-preparation.md` - 基础设施准备
- `docs/deploy/02-mysql-installation.md` - MySQL 安装配置
- `docs/deploy/03-database-initialization.md` - 数据库初始化
- `docs/deploy/04-app-deployment.md` - 应用部署
- `docs/deploy/05-nginx-configuration.md` - Nginx 配置
- `docs/deploy/06-backup-restore.md` - 备份恢复
- `docs/deploy/07-data-migration.md` - 数据迁移

## ⚠️ 注意事项

1. **生产环境密码安全**
   - 不要在脚本中硬编码密码
   - 使用环境变量或 `.env` 文件
   - 定期轮换数据库密码

2. **备份策略**
   - 每日自动备份（凌晨 3 点）
   - 保留 14 天备份
   - 定期测试恢复流程

3. **权限管理**
   - 部署脚本需要 root 权限
   - PM2 进程使用 www-data 运行
   - 数据库仅允许本地连接（生产环境）

4. **监控告警**
   - 配置 PM2 监控
   - 设置磁盘空间告警
   - 监控数据库连接数

## 📞 支持

遇到问题请查看：
- 项目 Wiki
- Issue 追踪
- 联系运维团队
