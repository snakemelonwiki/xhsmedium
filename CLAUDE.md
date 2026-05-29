# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

```bash
npm install
npm start              # Starts server on PORT (default 3000) and OWNER_PORT (default 3001)
```

- **Employee/Admin portal**: http://localhost:3000
- **Owner portal**: http://localhost:3001 (restricted to `role: 'owner'` users)
- Environment variables: copy `.env.example` to `.env` for development, `.env.production.example` for production
- MySQL must be running and configured (see `MYSQL_SETUP.md`)
- Database schema: `schema.sql`

## Architecture Overview

**Monolithic Node.js/Express application** with no build step, no tests, and no linting configured. Frontend is vanilla JavaScript served as static files.

### Dual-Port Authentication System

The app runs two logical instances on separate ports with role-based isolation:
- Port 3000: `staff` and `admin` roles
- Port 3001: `owner` role only (owner accounts cannot log in on port 3000)

Authentication uses in-memory `Map` sessions with Bearer tokens (not JWT). Sessions are lost on server restart. See `server.js` lines 550-580 for `authRequired` and `requireRole` middleware.

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
