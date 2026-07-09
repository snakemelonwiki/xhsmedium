# 项目交接文档

> **项目名称**：社交媒体运营中台系统（xhsmedium）
> **版本**：v1.3
> **最后更新**：2026-07-09
> **技术栈**：Node.js / Express / NestJS / Next.js / MySQL / TypeORM / Playwright

---

## 目录

1. [项目概述](#项目概述)
2. [系统架构](#系统架构)
3. [模块划分](#模块划分)
4. [数据流](#数据流)
5. [环境配置](#环境配置)
6. [启动方式](#启动方式)
7. [遗留问题](#遗留问题)
8. [附录](#附录)

---

## 项目概述

这是一个社交媒体运营中台系统，主要功能包括：

- **客资管理**：线索录入、状态流转、跟进记录、协同改派
- **订单管理**：成交转换、教务分配、节点提醒、支付记录
- **作品管理**：小红书/抖音作品录入、质量评估、收藏
- **账号管理**：社交账号注册、状态追踪、指标抓取
- **数据分析**：运营排行、平台统计、趋势分析
- **爬虫抓取**：Playwright 自动化抓取小红书/抖音作品数据

### 多角色体系

| 角色 | 权限 | 入口端口 |
|------|------|---------|
| owner（总管理员） | 全部权限 | 3001 |
| admin（管理员） | 大部分权限 | 3000 / 3003 |
| supervisor（主管） | 团队管理、作品评审 | 3000 / 3003 |
| sales（销售） | 客资录入、成交 | 3000 / 3003 |
| academic（教务） | 订单管理、节点提醒 | 3000 / 3003 |
| staff（运营） | 作品管理、账号管理 | 3000 / 3003 |

---

## 系统架构

详见 [architecture-diagram.md](architecture-diagram.md)

系统采用**单体分层架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端层（浏览器）                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼──┐    ┌────▼──┐    ┌───▼────┐
    │ 3000  │    │ 3001  │    │  3003  │   ← server.js (反向代理)
    │主入口  │    │总后台  │    │统一登录 │
    └────┬──┘    └───┬───┘    └───┬────┘
         │             │            │
         └─────────────┴────────────┘
                       │
           ┌──────────▼──────────┐
           │   NestJS API 8089   │  ← 业务逻辑
           └──────────┬──────────┘
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   ┌───▼───┐    ┌───▼───┐    ┌────▼────┐
   │ MySQL │    │ 缓存  │    │ 外部服务 │
   └───────┘    └───────┘    └─────────┘
                              Playwright
                              Nginx
```

---

## 模块划分

详见 [module-diagram.md](module-diagram.md)

### 按功能域分组（35+ 模块）

| 功能域 | 模块 | 说明 |
|--------|------|------|
| 核心基础设施 | auth, users, employees | 登录认证、用户账号、员工资料 |
| 客资管理 | leads, leads-parser, lead-drafts, parser | 线索核心、文本解析、草稿暂存 |
| 订单教务 | orders, reminders | 订单管理、节点提醒 |
| 作品账号 | posts, accounts, favorites | 作品管理、社交账号、收藏 |
| 数据分析 | analytics, dashboard, rankings | 统计分析、仪表盘、排行榜 |
| 协同任务 | collaboration-tasks, supervisor-suggestions | 销售-运营协同、主管评审 |
| 通知消息 | notifications | 站内通知 |
| 导入导出 | exports, imports | 异步导出、数据导入 |
| 爬虫 | scraping | Playwright 爬虫调度 |
| 销售端 | sales | 销售专属接口 |
| 工具公共 | operation-logs, uploads, tools, enums | 审计日志、文件上传、工具、枚举 |
| 其他 | finance, teachers, plaza-config | 财务、教师、广场配置 |

---

## 数据流

详见 [dataflow-diagram.md](dataflow-diagram.md)

### 核心数据实体关系

```
User ─── Employee
 │
 ├── Lead ─── LeadFollowRecord ─── Order ─── OrderFollowRecord
 │                                    ├── OrderReminder
 │                                    ├── OrderStatusHistory
 │                                    └── OrderPayment
 ├── Post ─── PostMetrics ─── PostMetricsHistory
 ├── Account
 ├── CollaborationTask
 ├── Favorite
 ├── Notification
 └── OperationLog
```

### 五大核心业务流程

1. **客资录入流**：Lead → 分配 → 跟进 → 成交 → 转 Order
2. **爬虫抓取流**：Playwright → Post → PostMetrics/PostMetricsHistory
3. **协同任务流**：销售发起 → 运营处理 → Lead 状态回退
4. **订单流转**：Lead 成交 → Order → 教务分配 → 节点提醒 → 支付
5. **操作审计流**：任何写操作 → OperationLog 记录

---

## 环境配置

### 必要环境

- **Node.js**：≥ 18.x
- **MySQL**：≥ 8.0
- **PM2**：（可选，生产环境使用）
- **Nginx**：（可选，生产环境使用）

### 配置文件

复制以下示例文件并修改：

```bash
# 根目录
cp .env.example .env

# 后端
cp backend/.env.example backend/.env
```

### 关键环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 主入口端口 |
| OWNER_PORT | 3001 | 总后台端口（仅 owner） |
| ALL_ROLES_PORT | 3003 | 统一登录入口 |
| BACKEND_URL | http://localhost:8089 | NestJS 后端地址 |
| FRONTEND_PUBLIC_URL | http://localhost:3302 | Next.js 前端地址 |

---

## 启动方式

### 开发环境

```bash
# 1. 安装依赖
npm install
cd backend && npm install && cd ..

# 2. 启动 MySQL（确保数据库已创建）
# 见 MYSQL_SETUP.md 和 schema.sql

# 3. 启动 NestJS 后端
cd backend
npm run build
npm start  # 监听 8089 端口

# 4. 启动 Next.js 前端（新开终端）
cd frontend
npm install
npm run dev  # 监听 3302 端口

# 5. 启动 server.js 反向代理（新开终端）
cd <项目根目录>
npm start    # 监听 3000/3001/3003 端口
```

### 生产环境

```bash
# 使用 PM2
cd <项目根目录>
pm run build  # 构建 NestJS 和 Next.js
npm run pm2:start  # 或 pm2 start ecosystem.config.js
```

### 开发规范

```bash
# 后端 TypeScript 检查
cd backend
npx tsc --noEmit 2>&1 | grep -v '\.spec\.ts'

# 前端构建检查
cd frontend
npx next build --turbopack 2>&1 | tail -20
```

---

## 遗留问题

详见 [遗留问题列表.md](遗留问题列表.md)

### 问题统计

| 类别 | 数量 | 说明 |
|------|------|------|
| P0（严重） | 23项 | 数据口径、服务崩溃、权限越权、字符集 |
| P1（重要） | 20项 | 前端功能缺失、竞态条件 |
| P2（一般） | 17项 | 性能优化、缓存、队列 |
| 待确认需求 | 9项 | 需与产品确认 |
| 技术债务 | 16项 | Hardcode、Deprecated、枚举漂移 |

### 最紧急 P0

1. **NestJS 进程稳定性**：10-14 次接口调用后崩溃，阻断端到端验收
2. **数据库列名错位**：`import-task.entity.ts` 的 `create_time` vs `created_at` 导致导入任务 500
3. **并发 refresh 竞态条件**：用户频繁被踢下线

---

## 附录

### 项目目录结构

```
xhsmedium-dev/
├── server.js              # 反向代理 + 静态文件服务
├── public/                # 老前端静态文件
├── frontend/              # Next.js 新前端
│   ├── src/               # 源代码
│   └── package.json
├── backend/               # NestJS 后端
│   ├── src/
│   │   ├── modules/       # 业务模块（35+ 个）
│   │   ├── entities/        # TypeORM 实体
│   │   ├── common/          # 公共设施（AuthGuard、中间件等）
│   │   ├── shared/          # 共享工具
│   │   ├── migrations/      # 数据库迁移
│   │   └── main.ts          # 入口文件
│   └── package.json
├── doc/                   # 文档
│   ├── handover/          # 本交接文档目录
│   │   ├── architecture-diagram.md
│   │   ├── module-diagram.md
│   │   ├── dataflow-diagram.md
│   │   ├── 遗留问题列表.md
│   │   └── README.md      # 本文件
│   └── ...
├── schema.sql             # 数据库初始化脚本
├── MYSQL_SETUP.md         # MySQL 安装配置指南
├── DEPLOY_CLOUD.md        # 云端部署指南
├── uploads/               # 用户上传文件
├── backups/               # 数据备份
└── ecosystem.config.js    # PM2 配置
```

### 重要文档索引

| 文档 | 说明 |
|------|------|
| [architecture-diagram.md](architecture-diagram.md) | 系统架构图（Mermaid） |
| [module-diagram.md](module-diagram.md) | 模块划分图（Mermaid） |
| [dataflow-diagram.md](dataflow-diagram.md) | 数据流图（Mermaid） |
| [遗留问题列表.md](遗留问题列表.md) | 遗留问题、TODO、技术债务 |
| ../MYSQL_SETUP.md | MySQL 安装配置 |
| ../DEPLOY_CLOUD.md | 云端部署指南 |
| ../README.md | 项目 README |
| ../CLAUDE.md | 开发规范（AI 助手用） |

### 联系方式

- **项目仓库**：`D:/webstormProjects/xhsmedium-dev`
- **当前分支**：dev
- **主分支**：main

---

> 本文档为项目交接使用，如有疑问请查阅相关源码或联系前任开发人员。
