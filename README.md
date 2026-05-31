# 运营中台

内部使用的运营协作中台 — 内容运营、客资协同、订单跟进、团队管理一体化。

## 技术栈

- **后端**：NestJS（TypeORM + MySQL），监听端口 `8089`
- **前端**：原生 JavaScript，由 legacy Express 反向代理承载（监听 `3001` / `3002`）
- **数据库**：MySQL 8.x
- **运行时**：Node.js 18+

## 一键启动

### Windows

双击根目录 **`start.bat`** 即可，脚本会自动：

1. 检测 Node.js
2. 缺 `.env` / `backend/.env` 时从对应 `.env.example` 生成并提示填写
3. 缺 `node_modules` 时自动 `npm install`
4. 同时启动 legacy proxy（3001 / 3002）和 NestJS（8089）

关闭窗口即停止服务。

### Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

## 访问入口

| 端口 | 用途 | URL |
| --- | --- | --- |
| 3002 | 员工 / 销售 / 主管 | http://localhost:3002 |
| 3001 | 总后台 | http://localhost:3001 |
| 8089 | NestJS API（内部） | http://localhost:8089/api/* |

> 3001 / 3002 只做静态资源 + SPA 兜底 + `/api/*` 反代到 8089，业务逻辑全部在 NestJS。

## 首次部署清单

1. **MySQL** —— 创建库：

   ```sql
   CREATE DATABASE lan_dual_role_system
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. **配置环境变量** —— 复制模板并填写：

   ```bash
   cp .env.example .env                       # 根目录：legacy 用
   cp backend/.env.example backend/.env       # backend：NestJS 用
   ```

   两个文件都要填 `MYSQL_PASSWORD`，`backend/.env` 还需设置 `JWT_SECRET`（生产环境务必改成 ≥ 32 字符的强随机串）。

3. **安装依赖**：

   ```bash
   npm install
   cd backend && npm install && cd ..
   ```

   如果需要使用小红书 / 抖音抓取、作品数据刷新、打开平台登录浏览器等 Playwright 功能，还需要在项目根目录安装浏览器内核：

   ```bash
   npm run install:browsers
   ```

   该命令会把 Chromium 下载到当前机器的 Playwright 缓存目录，不会写入仓库，也不需要提交浏览器文件。

   Linux 服务器也执行同一个命令；首次部署如果缺少系统运行库，可改用：

   ```bash
   npx playwright install --with-deps chromium
   ```

4. **初始化数据库 schema** ——

   ```bash
   mysql -u root -p lan_dual_role_system < schema.sql
   node scripts/run-migrations.js
   node scripts/backfill-lead-code.js
   ```

5. **启动**：双击 `start.bat`（Windows）或 `./start.sh`（Linux / macOS），也可直接 `npm start`。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm start` | 同时启动 legacy proxy + NestJS |
| `npm run install:browsers` | 安装 Playwright Chromium，用于小红书 / 抖音抓取与作品数据刷新 |
| `node scripts/run-migrations.js` | 应用未执行的 migrations |
| `node scripts/run-migrations.js --status` | 查看迁移状态 |
| `node scripts/run-migrations.js --down=M2__leads_backfill` | 回滚指定迁移 |
| `node scripts/backfill-lead-code.js` | 按 `created_at` 回填客资编号 |
| `node scripts/backfill-lead-code.js --force` | 强制重新生成所有客资编号 |

## 目录结构

```
.
├─ start.bat / start.sh        一键启动脚本
├─ server.js                   legacy proxy（49 行，仅反代 + 静态）
├─ public/                     前端 SPA（vanilla JS）
├─ backend/                    NestJS 后端（业务路由）
│  └─ src/modules/             accounts / auth / dashboard / employees /
│                              leads / notifications / posts / rankings /
│                              tools / users / analytics
├─ migrations/                 数据库迁移（M1__/M2__/...）
├─ scripts/                    迁移执行器 + 一次性数据脚本
├─ schema.sql                  数据库基线 DDL
├─ ddl/                        独立 DDL 片段（备查）
└─ doc/                        设计与需求文档
```

## 相关文档

- `doc/B端-问题修复方案.md` —— B 端客资协同域的设计基线
- `migrations/README.md` —— 数据库迁移说明（含字段映射、回滚步骤）
- `MYSQL_SETUP.md` —— MySQL 准备与初始化细节
- `DEPLOY_CLOUD.md` —— 生产环境部署指引
- `TECH_STACK.md` —— 技术选型背景
- `PLAYWRIGHT_PROFILES.md` —— Playwright 抓取登录态维护

## 常见问题

**Q：3000 端口被占用？**
A：legacy 已改用 3001 / 3002，NestJS 默认 8089。如果仍冲突，编辑 `.env` 中 `PORT` 与 `OWNER_PORT`，以及 `backend/.env` 中 `PORT`。

**Q：登录提示"用户名或密码错误"？**
A：密码加密用的是 bcrypt，明文校验已废弃。建议通过 NestJS 提供的种子工具生成测试账号，或直接更新数据库 `users.password` 为 bcrypt 哈希。

**Q：迁移卡住或报错？**
A：先 `node scripts/run-migrations.js --status` 看进度，再参考 `migrations/README.md` 的"故障排查"段落。

**Q：刷新作品数据时报 Playwright 浏览器不存在？**
A：在项目根目录执行 `npm run install:browsers`。Linux 服务器如果还提示缺少依赖库，执行 `npx playwright install --with-deps chromium`。
