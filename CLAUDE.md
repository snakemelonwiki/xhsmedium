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
