# 步骤 7:常见问题排查

> 部署/迁移/上线时遇到 7 类典型问题,这里给出现成答案。

## 1. MySQL 没装 / 服务没启

**症状**:`Can't connect to MySQL server on '127.0.0.1' (111)` / `ECONNREFUSED`

**排查**:
```bash
systemctl status mysql           # 看服务状态
ss -lntp | grep 3306             # 看端口监听
journalctl -xeu mysql.service    # 看错误日志
```

**修**:
- 没装 → 重跑 `install-mysql.sh`
- 装了没启 → `systemctl enable --now mysql`
- 启了但监听不对 → 编辑 `/etc/mysql/mysql.conf.d/mysqld.cnf` 改 `bind-address`,再 `systemctl restart mysql`

## 2. Node 版本不匹配

**症状**:`The engine "node" is incompatible with this module` / `Cannot find module` / `next build` 跑挂

**排查**:
```bash
node -v
cat .nvmrc    # 项目要求 20
```

**修**:
```bash
# nvm 方案
nvm install 20 && nvm use 20
# 直接装
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs
```

## 3. 权限 / 写不进去

**症状**:`EACCES: permission denied, open '/var/www/lan-system/uploads/xxx'`

**修**:
```bash
sudo chown -R $USER:$USER /var/www/lan-system
# 或 PM2 跑哪个用户就给那个用户所有权
sudo chown -R www-data:www-data /var/www/lan-system
```

## 4. 端口被占

**症状**:`Error: listen EADDRINUSE :::3000` / `EADDRINUSE :::8089`

**排查**:
```bash
sudo lsof -i :3000
sudo lsof -i :8089
```

**修**:
- 杀进程:`kill -9 <pid>`
- 或改端口:`.env` 里改 `PORT=8089` → `8090`,PM2 跟着改

## 5. Playwright / Chromium 装不上或启动失败

**症状**:`Executable doesn't exist at .../chromium-xxxx/chrome-linux/chrome`

**排查**:
```bash
npx playwright --version
ls ~/.cache/ms-playwright/ 2>/dev/null
```

**修**:
```bash
# 重新装
npx playwright install --with-deps chromium
# 装系统依赖
sudo apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0
```

**Headless 服务器(无 GUI)**:`openLoginBrowser` 端点会失败,因为需要扫码。`fetch-metrics` 端点(headless)能跑。

## 6. xsec_token 失效

**症状**:`抓取失败:请先调用 openLoginBrowser` / `page.goto: net::ERR_CONNECTION_RESET`

**原因**:小红书/抖音短链里的 xsec_token 用一次扣一次信用度,频繁抓会降级。

**修**:
- 打开老 `playwright-login.js` 走完整登录刷新 Profile:
  ```bash
  cd /var/www/lan-system
  node scripts/playwright-login.js 小红书  # 弹出 Chromium,扫码
  node scripts/playwright-login.js 抖音
  ```
- 把登录态持久化到 `.playwright-profiles/`,后续抓取自动复用
- 部署服务器没 GUI 时:在**本地**登录后 `rsync -av .playwright-profiles/ server:/var/www/lan-system/.playwright-profiles/`

## 7. ffmpeg 缺失(缩略图脚本需要)

**症状**:`spawn ffmpeg ENOENT`

**修**:
```bash
sudo apt install -y ffmpeg
# Windows
choco install ffmpeg
# 或下载 https://www.gyan.dev/ffmpeg/builds/ 解压到 PATH
```

## 8. `pm2 startup` 开机自启失败

**症状**:`[PM2] You have to run this command as root`

**修**:必须用 root 跑 `pm2 startup` 才能注册 systemd unit,然后 `pm2 save`。

## 9. 数据库迁移时报"未识别平台"

**症状**:`/api/posts/parse-link` 返回 `暂时只支持小红书和抖音作品链接`

**原因**:URL 用了 `v.douyin.com` 短链或 `iesdouyin.com` 老短链

**修**:已经在 `metricsFetcher.js` 加了 `v.douyin.com` / `iesdouyin.com` 识别。如果还报,看 `git log metricsFetcher.js` 确认最新代码已部署。

## 10. NestJS 启不来

**症状**:`pm2 list` 看到 `lan-system` 是 `errored` 状态

**排查**:
```bash
pm2 logs lan-system --lines 100
# 或直接跑看错误
cd /var/www/lan-system
node backend/dist/main.js
```

**常见原因**:
- `backend/.env` 缺 MYSQL_* 变量
- `MYSQL_PASSWORD` 含特殊字符(用单引号包整个 value)
- DB 还没建(看步骤 2)

## 应急回滚

```bash
# 1) 停 PM2
pm2 stop lan-system

# 2) 拉回老 commit
cd /var/www/lan-system
git checkout <上一稳定commit>

# 3) 重装 + 启
bash docs/deploy/scripts/deploy-app.sh
pm2 startOrReload ecosystem.config.js

# 4) 如果 DB 也要回滚
bash docs/deploy/scripts/restore-db.sh /var/backups/lan-system/db/<日期>.sql.gz
```
