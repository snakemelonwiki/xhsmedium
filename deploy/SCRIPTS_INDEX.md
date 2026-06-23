# 部署脚本索引

快速查找和使用部署脚本。

## 📦 打包

| 脚本 | 用途 | 命令 |
|------|------|------|
| `package-code-only.sh` | 生成代码压缩包（排除数据） | `bash deploy/package-code-only.sh` |

## 🚀 部署

| 脚本 | 用途 | 命令 |
|------|------|------|
| `setup-linux.sh` | **Linux 一键部署**（系统依赖 + Node + Playwright + Xvfb + MySQL + PM2 + Nginx） | `sudo bash deploy/setup-linux.sh` |
| `deploy-app.sh` | 应用部署（仅代码编译 + PM2，需先装好依赖） | `sudo bash deploy/deploy-app.sh` |
| `install-mysql.sh` | 安装 MySQL 8.0 | `sudo bash deploy/install-mysql.sh` |
| `init-database.sh` | 初始化数据库和表结构 | `sudo MYSQL_PASSWORD="pwd" bash deploy/init-database.sh` |

## 🔄 数据迁移（Node.js）

| 脚本 | 用途 | 命令 |
|------|------|------|
| `migrate-from-legacy.js` | 从 data.json 迁移到 MySQL | `node deploy/migrate-from-legacy.js` |
| `run-migrations.js` | 执行数据库 schema 迁移 | `node deploy/run-migrations.js` |
| `seed-demo-data.js` | 生成演示数据 | `node deploy/seed-demo-data.js` |
| `backfill-post-cover-thumbs.js` | 批量生成封面缩略图 | `node deploy/backfill-post-cover-thumbs.js --write` |

## 💾 备份恢复

| 脚本 | 用途 | 命令 |
|------|------|------|
| `backup-db.sh` | mysqldump 备份 | `sudo MYSQL_PASSWORD="pwd" bash deploy/backup-db.sh` |
| `restore-db.sh` | 从备份恢复 | `sudo MYSQL_PASSWORD="pwd" bash deploy/restore-db.sh backup.sql.gz` |
| `migrate-legacy-data.sh` | Shell 版本数据迁移 | `sudo bash deploy/migrate-legacy-data.sh` |

## 🔧 配置

| 文件 | 用途 |
|------|------|
| `nginx.lan-system.conf` | Nginx 反向代理配置 |
| `README.md` | 完整使用文档 |

## ⚡ 快速命令

```bash
# 全新部署（推荐：一键脚本）
sudo bash deploy/setup-linux.sh

# 全新部署（分步）
sudo bash deploy/install-mysql.sh && \
sudo MYSQL_PASSWORD="your_password" bash deploy/init-database.sh && \
sudo bash deploy/deploy-app.sh

# 更新部署
git pull && sudo bash deploy/deploy-app.sh

# 数据迁移 + 缩略图
node deploy/migrate-from-legacy.js --source=/old/path && \
node deploy/backfill-post-cover-thumbs.js --write

# 定时备份（加入 crontab）
0 3 * * * MYSQL_PASSWORD="pwd" /var/www/lan-system/deploy/backup-db.sh >> /var/log/lan-backup.log 2>&1
```

## 📊 脚本对比：Shell vs Node.js

### 数据迁移对比

| 特性 | `migrate-legacy-data.sh` | `migrate-from-legacy.js` |
|------|-------------------------|-------------------------|
| 语言 | Bash + SQL | Node.js |
| 复杂度 | 简单 | 强大 |
| 错误处理 | 基础 | 完善 |
| 校验 | 无 | 有业务关系校验 |
| 幂等性 | 有 | 有（更智能） |
| 文件复制 | 不支持 | 支持 uploads/ 复制 |
| 进度显示 | 基础 | 详细 |
| Dry-run | 不支持 | 支持 |
| 推荐 | ❌ 简单场景 | ✅ 生产环境 |

**建议**：生产环境使用 `migrate-from-legacy.js`，它功能更完善、错误处理更好。

## 📖 详细文档

- 完整使用说明：[README.md](./README.md)
- 部署文档：`docs/deploy/`
- 项目 Wiki（如有）

## 🆘 故障排查

| 问题 | 解决方案 |
|------|----------|
| 权限错误 | 使用 `sudo` 运行 shell 脚本 |
| MySQL 连接失败 | 检查 `.env` 中的 `MYSQL_*` 配置 |
| 编译失败 | 清理 `node_modules` 后重试 |
| PM2 启动失败 | `pm2 logs` 查看日志 |
| 备份失败 | 检查磁盘空间和 MySQL 权限 |

## 🔐 安全提醒

- **不要在脚本中硬编码密码**
- 使用环境变量传递 `MYSQL_PASSWORD`
- 备份文件定期清理（默认保留 14 天）
- 生产环境 MySQL 仅监听本地端口
