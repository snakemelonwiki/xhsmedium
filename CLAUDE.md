# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

```bash
npm install
npm start              # Starts server on PORT (3000) + OWNER_PORT (3001) + ALL_ROLES_PORT (3003)
```

- **Employee/Admin portal**: http://localhost:3000
- **Owner-only console (总后台)**: http://localhost:3001 (restricted to `role: 'owner'`)
- **Unified login entry (统一登录入口)**: http://localhost:3003 (admin / supervisor / sales / academic / staff；**owner 仍必须 3001**)
- **Next.js frontend (dev)**: http://localhost:3302 (新前端，dev/start 脚本固定 3302，与本进程不冲突)
- Environment variables: copy `.env.example` to `.env` for development, `.env.production.example` for production
- MySQL must be running and configured (see `MYSQL_SETUP.md`)
- Database schema: `schema.sql`

> **开发规范**: 后续所有前端代码变更只涉及新前端 (`frontend/src/`)，不修改旧前端 (`public/`) 代码。

## 开发工作流

每次完成一个任务后，对涉及变更的项目执行静态编译检查：

```bash
# 后端变更后
cd backend && npx tsc --noEmit 2>&1 | grep -v '\.spec\.ts'

# 前端变更后（Next.js 构建检查）
cd frontend && npx next build --turbopack 2>&1 | tail -20
```

- 确保编译无 error（.spec.ts 测试文件的预期错误可忽略）
- 前端构建的 TypeScript 类型错误必须修复，lint 警告可酌情处理

## Architecture Overview

**Monolithic Node.js/Express application** with no build step, no tests, and no linting configured. Frontend is vanilla JavaScript served as static files.

### Multi-Port Authentication System (v1.3，2026-06-04)

The app runs **one Node process** listening on **three ports** with role-based isolation.
The business API itself lives in NestJS on port 8089; `server.js` is purely a reverse proxy
+ static file server. See `doc/修复说明-端口体系-v1.3.md` for the full spec, and
`doc/修复说明-B7-端口隔离.md` for the historical B7 dual-port baseline.

| Port | Env var | Default | Allowed roles | Rejected |
| --- | --- | --- | --- | --- |
| **3000** 主入口 | `PORT` | 3000 | sales / academic / staff / admin / supervisor | owner |
| **3001** 总后台 | `OWNER_PORT` | 3001 | owner | admin / supervisor / sales / academic / staff |
| **3003** 统一登录入口 | `ALL_ROLES_PORT` | 3003 | sales / academic / staff / admin / supervisor | owner (L2 拒绝) |
| 3302 新前端 (Next.js) | — | (frontend owned) | — | server.js 不监听 |

- **3302 reserved by Next.js**: `frontend/package.json` dev/start scripts pin Next.js to `-p 3302`,
  so the new unified login port defaults to **3003** instead. Set `ALL_ROLES_PORT=3302` only if
  Next.js is moved off 3302.
- **Three defenses (L1/L2/L3)**: L1 = `server.js` Express middleware (O(1) JWT peek, 403); L2 =
  `auth.service.ts:login` (401 with port/role context); L3 = `auth.guard.ts:assertRolePortMatch`
  (403 on any /api hit).
- **owner 强制 3001** is a hard P0 rule: even on 3003 the L2 layer rejects `role==='owner'`
  with the message `owner 账号必须从 3001 端口（总后台）登录`.
- B7's `ALLOWED_OWNER_ROLES` is **tightened** to `["owner"]` only; admin/supervisor now log in
  via 3003 and can still hit `/owner` resources through NestJS' normal permission check.

### Data Layer: MySQL + Legacy JSON

The app supports two data sources simultaneously, creating consistency risks:
- **MySQL** (primary): 5 tables (`users`, `employees`, `accounts`, `posts`, `leads`). Access layer in `repositories.js`.
- **JSON files** (legacy): `data.json` and `daily-snapshots.json` with automatic backup rotation (max 40 backups per file in `backups/` dir).

Production should use MySQL only. The JSON fallback exists for development/demo but is not actively maintained.

### Playwright Social Media Scraping

Core business feature: automated scraping of Xiaohongshu (小红书) and Douyin (抖音) post metrics using Playwright.
- Entry point: `metricsFetcher.js` exports `fetchMetricsFromUrl()` and `openLoginBrowser()`
- Browser profiles persist in `.playwright-profiles/` to maintain login sessions
- Scraping runs synchronously within request handlers (15s timeout, can block main thread)
- Platforms detected by URL pattern matching (line 11-15 in `metricsFetcher.js`)

### File Structure

- `server.js` (2562 lines): Express routes, auth, business logic (highly coupled monolith)
- `public/app.js` (5896 lines): Frontend state management, DOM rendering, API calls
- `public/styles.css` (4906 lines): All styling
- `repositories.js`: MySQL CRUD operations
- `metricsFetcher.js`: Playwright scraping logic
- `uploads/`: User-uploaded images (cover images, lead capture screenshots)

### Key Dependencies

- `express` 4.21.2: Web framework
- `mysql2` 3.21.1: Database driver with connection pooling (max 10 connections)
- `multer` 2.1.1: File upload handling (20MB limit)
- `playwright` 1.59.1: Browser automation for scraping
- `dotenv` 17.4.1: Environment variable management
- `echarts` 5: Charting (loaded via CDN in `public/index.html`, not bundled)

### Deployment

- Process manager: PM2 (`ecosystem.config.js`, single instance fork mode)
- Reverse proxy: Nginx (`deploy/nginx.lan-system.conf`)
- HTTPS: Let's Encrypt + certbot
- Packaging: `bash deploy/package-code-only.sh` creates zip excluding `uploads/`, `backups/`, `data.json`

### Backend (`backend/` — NestJS)

业务 API 运行在 NestJS，监听端口 **8089**，`server.js` 做反向代理转发 `/api/*` 请求。

```bash
cd backend
npm run build      # 编译 TypeScript → dist/
npm start           # 启动 NestJS (dist/main.js)
```

**目录结构**:

| 目录 | 用途 |
| --- | --- |
| `src/main.ts` | 入口：Bootstrap NestJS，注册全局中间件（请求日志、JWT 鉴权、Body 大小限制、异常过滤器） |
| `src/app.module.ts` | 根 Module，聚合所有业务模块 |
| `src/entities/` | TypeORM 实体定义（lead, order, user, employee, account, post 等 25+ 实体） |
| `src/common/` | 公共设施：`auth.guard.ts`（JWT + 端口角色校验）、`session.utils.ts`（从 req 提取 userId/role）、`all-exceptions.filter.ts`、中间件 |
| `src/shared/` | 共享工具：`utils/id-generator.ts`、`operation-logs.constants.ts`、`notifications.ts` |
| `src/modules/` | 业务模块（见下表） |
| `src/migrations/` | TypeORM 数据库迁移脚本 |

**业务模块 (`src/modules/`)**:

| 模块 | 说明 |
| --- | --- |
| `auth` | 登录 / JWT 签发 / 密码校验（bcrypt + 明文双轨） |
| `users` | 用户账号 CRUD，密码管理，状态变更 |
| `employees` | 员工资料 + 关联登录账号（创建/重置密码/软删除） |
| `leads` | 客资核心：录入/状态流转/跟进记录/协同/改派/导出 |
| `orders` | 订单管理：创建/交接/教务分配/节点提醒/成交状态 |
| `posts` | 作品管理：CRUD / 来源识别 / 质量状态 |
| `accounts` | 社交账号管理（小红书/抖音） |
| `analytics` | 数据分析：快照/趋势/平台统计 |
| `dashboard` | 总览仪表盘汇总接口 |
| `rankings` | 运营排行榜 |
| `notifications` | 站内消息通知 |
| `exports` | 异步导出任务（CSV/Excel） |
| `imports` | 数据导入（客资批量导入） |
| `favorites` | 收藏夹（作品收藏） |
| `collaboration-tasks` | 销售-运营协同任务 |
| `reminders` | 教务节点提醒 |
| `scraping` | Playwright 爬虫调度（小红书/抖音指标抓取） |
| `operation-logs` | 操作日志审计 |
| `supervisor-suggestions` | 主管作品评审建议 |
| `sales` | 销售专属接口（home-summary、deals 等） |
| `parser` / `leads-parser` | 客资文本解析（粘贴识别） |
| `lead-drafts` | 客资草稿暂存 |
| `tools` | 工具类接口 |
| `uploads` | 文件上传（头像/引流截图） |
| `enums` | 枚举常量定义 |

**关键鉴权链路**:

1. **L1** (`server.js`): Express 层 JWT peek，未登录直接 403
2. **L2** (`auth.service.ts:login`): 登录时校验端口与角色匹配（如 owner 必须 3001）
3. **L3** (`auth.guard.ts`): 所有 `/api/*` 请求通过 `AuthGuard` 校验 JWT + 端口-角色绑定
4. **操作日志** (`operation-logs/`): 关键写操作（创建/更新/删除/改派/重置密码）自动记录审计日志
