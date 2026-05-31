# 云服务器部署说明

这套系统已经适合部署到云服务器，员工和主管都可以直接通过公网域名登录，不再依赖你的电脑持续开机。

## 一、推荐环境

- Ubuntu 22.04
- 2 核 CPU
- 4GB 内存
- 50GB SSD
- Node.js 20
- MySQL 8
- Nginx
- PM2

## 二、服务器目录建议

```bash
/var/www/lan-system
```

## 三、上传项目

把当前目录中的 `lan-system` 上传到服务器，例如：

```bash
/var/www/lan-system
```

如果你希望“以云服务器上的数据为准”，不要直接把本地整个目录覆盖上去。

建议只上传代码，不上传这些本地数据文件：

- `data.json`
- `daily-snapshots.json`
- `uploads/`
- `backups/`
- `versions/`

当前项目已经附带一个代码打包脚本：

```bash
bash deploy/package-code-only.sh
```

执行后会生成一个不包含本地业务数据的代码包，适合上传到云服务器做代码更新。

## 四、安装依赖

进入项目目录后执行：

```bash
npm install
```

如果服务器需要使用小红书 / 抖音抓取、作品数据刷新、打开平台登录浏览器等 Playwright 功能，还要安装 Chromium：

```bash
npm run install:browsers
```

Linux 首次部署如果提示缺少浏览器系统依赖，执行：

```bash
npx playwright install --with-deps chromium
```

该命令只安装到服务器本机缓存，不需要也不应该把浏览器文件提交到 Git。

## 五、配置 MySQL

### 1. 创建数据库

登录 MySQL 后执行：

```sql
CREATE DATABASE lan_dual_role_system DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 创建业务账号

```sql
CREATE USER 'lan_system_user'@'127.0.0.1' IDENTIFIED BY 'change_this_password';
GRANT ALL PRIVILEGES ON lan_dual_role_system.* TO 'lan_system_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3. 执行表结构

```bash
mysql -u lan_system_user -p lan_dual_role_system < schema.sql
```

## 六、配置环境变量

复制生产环境模板：

```bash
cp .env.production.example .env
```

按实际信息修改：

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `APP_BASE_URL`

## 七、启动服务

建议使用 PM2：

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

如果你的项目目录不是 `/var/www/lan-system`，记得同步修改：

- `ecosystem.config.js` 中的 `cwd`

## 八、配置 Nginx

把以下文件放到 Nginx 配置目录：

- `deploy/nginx.lan-system.conf`

示例位置：

```bash
/etc/nginx/conf.d/lan-system.conf
```

把其中的域名 `your-domain.com` 改成你的正式域名。

检查并重载：

```bash
nginx -t
systemctl reload nginx
```

## 九、配置 HTTPS

建议使用 Let's Encrypt：

```bash
apt update
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
```

完成后员工和主管就可以通过：

```text
https://your-domain.com
```

访问系统。

## 十、上线前检查清单

上线前建议确认：

1. 管理员默认密码已经修改
2. 员工账号已经创建
3. MySQL 已可写
4. 上传目录可写
5. HTTPS 已启用
6. 服务器防火墙已放行 80 和 443

## 十一、备份建议

至少备份两类内容：

1. MySQL 数据库
2. 上传目录 `uploads`

推荐每天做一次数据库备份。

## 十二、当前项目需要注意的地方

目前这套系统在代码层面已经支持：

- 本地 JSON 模式
- MySQL 模式

正式上云时，建议以 MySQL 为主，不再依赖本地 JSON 作为正式业务数据源。

## 十三、如果线上数据已经存在，如何避免被本地覆盖

如果云服务器已经在跑，并且线上 MySQL/上传目录里已有正式数据，请按这个原则更新：

1. 线上数据库是唯一业务数据源
2. 本地 `data.json` 只当开发机数据，不上传覆盖线上
3. 线上 `uploads/` 保留，不用本地 `uploads/` 覆盖
4. 只替换代码文件，执行 `npm install`、重启 PM2

推荐更新顺序：

```bash
# 服务器上先备份
mysqldump -u lan_system_user -p lan_dual_role_system > backup_before_deploy.sql
cp -R /var/www/lan-system/uploads /var/www/lan-system/uploads_backup_$(date +%F_%H%M%S)

# 再替换代码
unzip -o lan-system-code-only.zip -d /var/www/lan-system
cd /var/www/lan-system
npm install
pm2 restart ecosystem.config.js
```

这样部署后，代码更新了，但线上 MySQL 和上传文件仍然保持原样，系统自然就会以云服务器上的数据为准。
