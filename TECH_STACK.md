# 技术栈全景分析

> 分析日期: 2026-05-28

---

## 1. 前端

| 维度 | 技术选型 | 说明 |
|------|---------|------|
| 架构 | 原生 JavaScript (Vanilla JS) | 无框架、无构建工具，单文件 `public/app.js` (5896 行) |
| 样式 | 原生 CSS | `public/styles.css` (4906 行) |
| 可视化 | ECharts 5 | CDN 引入，非 npm 依赖 |
| HTTP 客户端 | 原生 `fetch()` API | 无 axios 等封装库 |
| 本地存储 | `localStorage` | 缓存 token、学习记录、跟进计划、复盘高亮等 |
| 路由 | 无客户端路由 | 基于状态的手动 DOM 渲染（类 SPA 但非标准路由） |
| 响应式 | UA 检测动态 viewport | 移动端强制 1380px 宽 |

## 2. 后端

| 维度 | 技术选型 | 说明 |
|------|---------|------|
| 运行时 | Node.js 20 | 部署目标版本 |
| 框架 | Express 4.21.2 | 单文件 `server.js` (2562 行)，高度耦合 |
| 认证 | 自研内存会话系统 | `Map` 存储 Bearer token，非 JWT/cookie |
| 权限 | 基于角色的访问控制 (RBAC) | admin / owner / staff 三种角色 |
| 文件上传 | multer 2.1.1 | 磁盘存储，限制 20MB |
| 浏览器自动化 | Playwright 1.59.1 | 从小红书/抖音抓取帖子互动数据 |
| 数据访问层 | `repositories.js` (406 行) | MySQL 查询封装 |
| 环境配置 | dotenv 17.4.1 | `.env` 文件管理 |

## 3. 数据库

| 维度 | 技术选型 | 说明 |
|------|---------|------|
| 主库 | MySQL 8 | mysql2 3.21.1，连接池模式，最大 10 连接 |
| 字符集 | utf8mb4_unicode_ci | 支持 emoji 和特殊字符 |
| 核心表 | 5 张 | `users`, `employees`, `accounts`, `posts`, `leads` |
| 历史兼容 | 本地 JSON 文件双写 | `data.json`, `daily-snapshots.json`，生产环境建议仅用 MySQL |
| 备份 | 自动轮转 JSON 文件备份 | 最多 40 份/文件，无数据库级备份脚本 |

### 表结构概览

```
users        — 系统用户（admin/owner/staff）
employees    — 员工信息（工号、姓名、入职日期）
accounts     — 社交媒体账号（小红书/抖音，含人设定位）
posts        — 发布内容（标题、文案、封面、互动数据）
leads        — 客资线索（联系方式、预算、意向、跟进状态）
```

## 4. 缓存

| 维度 | 现状 | 说明 |
|------|------|------|
| 独立缓存层 | 无 | 未使用 Redis / Memcached |
| 应用级缓存 | 无 | 每次请求直接查库，无内存缓存策略 |
| 前端缓存 | `localStorage` | 仅存储少量用户偏好数据 |

## 5. 实时通信

| 维度 | 现状 | 说明 |
|------|------|------|
| 推送机制 | 无 | 未使用 WebSocket / Socket.IO / SSE |
| 数据获取 | 纯请求-响应 | 需手动刷新，无自动轮询 |

## 6. 文件存储

| 维度 | 现状 | 说明 |
|------|------|------|
| 存储方式 | 本地文件系统 | `uploads/` 目录，Express static 中间件直接暴露 |
| 云存储 | 无 | 未接入 S3 / OSS / COS 等对象存储 |
| 文件类型 | 封面图 + 客资截图 | `coverImage`, `captureImage` |

## 7. 队列

| 维度 | 现状 | 说明 |
|------|------|------|
| 任务队列 | 无 | 未使用 Bull / Agenda / RabbitMQ |
| 异步处理 | 同步执行 | Playwright 抓取在请求内同步执行（超时 15s，可能阻塞） |

## 8. 部署

| 维度 | 技术选型 | 说明 |
|------|---------|------|
| 进程管理 | PM2 | 单实例 fork 模式，`ecosystem.config.js` |
| 反向代理 | Nginx | HTTP/1.1，支持 WebSocket 升级（预留） |
| HTTPS | Let's Encrypt + certbot | 自动化证书管理 |
| 目标环境 | Ubuntu 22.04 | 2 核 4G，50GB SSD |
| 部署脚本 | `deploy/package-code-only.sh` | 生成不含业务数据的代码包 |
| 端口策略 | 双端口隔离 | 3000（员工/管理员），3001（老板专用入口） |

---

## 架构特点总结

- **单体架构**: 前后端未分离，前端无构建流程，后端单文件巨型 `server.js`
- **轻量级**: 无缓存/队列/消息中间件，适合小规模团队（< 50 人）
- **数据双源**: MySQL + JSON 文件并存，存在一致性风险（生产环境应彻底切到 MySQL）
- **抓取依赖**: Playwright 自动化抓取社交媒体数据是核心业务价值点，但同步执行可能成为性能瓶颈
- **会话脆弱性**: 内存会话无持久化，PM2 重启后所有用户需重新登录

## 依赖清单 (npm)

```json
{
  "dotenv": "^17.4.1",
  "express": "^4.21.2",
  "multer": "^2.1.1",
  "mysql2": "^3.21.1",
  "playwright": "^1.59.1"
}
```

## 核心文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `server.js` | 2562 | Express 路由、认证、业务逻辑（巨型单文件） |
| `public/app.js` | 5896 | 前端全部逻辑（状态管理、DOM 渲染、API 调用） |
| `public/styles.css` | 4906 | 全部样式 |
| `repositories.js` | 406 | MySQL 数据访问层（CRUD 封装） |
| `metricsFetcher.js` | 433 | Playwright 社交媒体数据抓取 |
| `db.js` | 28 | MySQL 连接池配置 |
| `schema.sql` | 96 | 数据库表结构定义 |
