/**
 * PM2 ecosystem 配置 — lan-system
 * ----------------------------------------------------------------
 * 维护要点（2026-06-07）
 *  - 本进程模型: 一台机器上 3 个 Node 进程, 分别承担:
 *      1) lan-legacy     : 反代 + 静态 (server.js)   监听 3000/3001/3003
 *      2) lan-nestjs     : NestJS API (backend/dist) 监听 8089
 *      3) lan-frontend   : Next.js production        监听 3302
 *  - 共用同一份 MySQL + 同一份 .env, 但通过 cwd / script 区分。
 *  - 端口 3002 已弃用 (Next.js 占用), 统一登录端口 ALL_ROLES_PORT=3003。
 *
 * 日志策略 (本文件关键变更):
 *  - 所有 stdout/stderr 由 PM2 重定向到 /var/log/lan-system/<app>-{out,error}.log
 *  - 推荐搭配 pm2-logrotate 插件 (见 docs/deploy/scripts/install-pm2-logrotate.sh)
 *  - 或使用系统 logrotate  (见 docs/deploy/scripts/logrotate-lan-system)
 *  - 二选一, 不要同时开 (会产生日志竞争, 偶发丢行)
 *
 * 使用方式:
 *   pm2 startOrReload ecosystem.config.js --env production
 *
 * 二次更新:
 *   pm2 reload ecosystem.config.js
 */

module.exports = {
  apps: [
    /* ============================================================
     * 1) lan-legacy — Express 反代 + 静态资源 (3000/3001/3003)
     *    - 跑 server.js: 它内部会 listen PORT / OWNER_PORT / ALL_ROLES_PORT
     *    - 一个 PM2 进程就够 (单进程足够, fork 模式)
     *    - 互备时复制一份改 name 即可, PM2 不会端口冲突
     * ========================================================== */
    {
      name: "lan-legacy",
      script: "server.js",
      cwd: "/var/www/lan-system",
      instances: 1,
      exec_mode: "fork",
      // ⚠️ 不要在这里写 instances > 1, server.js 自己 listen 三个端口, 复制进程
      //    会全部 EADDRINUSE; 真正互备请复制整个 app 对象改 name 起两份.

      // 日志: PM2 会把 stdout/stderr 写到这两个文件 (PM2 自己 rotate 不开,
      //       由 pm2-logrotate 插件或系统 logrotate 接管).
      out_file: "/var/log/lan-system/lan-legacy-out.log",
      error_file: "/var/log/lan-system/lan-legacy-error.log",
      // merge_logs: true 表示多实例 (fork 模式下也有效) 的日志合并, 这里只有一个实例,
      // 主要是避免 PM2 内部 "instance-X" 后缀让 logrotate 路径变得不固定.
      merge_logs: true,
      // log_date_format: 每行日志前缀带时间戳, 排查 crash 时不用再 cat 启动时间.
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // 日志单行最大长度, 防恶意/异常输出把日志撑爆 (默认 ~1MB 不够, 改 50KB).
      log_file_dateRotate: undefined, // 占位, 走下面 max_size 兜底

      // 自动重启: 进程异常退出 1 秒后拉起, 单进程最多 10 次避免死循环.
      autorestart: true,
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: "10s",

      // 内存阈值: 超过 500MB 自动 reload (legacy 走反代不该占那么多).
      max_memory_restart: "500M",

      // 环境变量 (生产). 走 --env production 注入.
      env: {
        NODE_ENV: "production",
        // 三个监听端口.
        PORT: 3000,
        OWNER_PORT: 3001,
        ALL_ROLES_PORT: 3003,
        // NestJS 反代目标.
        BACKEND_URL: "http://127.0.0.1:8089",
        // 新前端公开 URL (Next.js 端口, 用来 302 到 /owner 等).
        FRONTEND_PUBLIC_URL: "http://127.0.0.1:3302",
      },
    },

    /* ============================================================
     * 2) lan-nestjs — NestJS API (8089)
     *    - 跑 backend/dist/main.js (先 npm run build 在 backend/)
     *    - 业务路由全部在这, server.js 只做反代.
     * ========================================================== */
    {
      name: "lan-nestjs",
      script: "./dist/main.js",     // backend/dist/main.js
      cwd: "/var/www/lan-system/backend",
      instances: 1,                  // 单进程足够, MySQL 连接池共享; 多实例需配 cluster
      exec_mode: "fork",
      node_args: ["--max-old-space-size=1024"], // 限制 V8 heap, 防 OOM

      out_file: "/var/log/lan-system/lan-nestjs-out.log",
      error_file: "/var/log/lan-system/lan-nestjs-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      autorestart: true,
      restart_delay: 2000,           // 给 MySQL/Redis 一点时间
      max_restarts: 10,
      min_uptime: "15s",
      max_memory_restart: "1500M",   // 业务进程, 1.5G 阈值

      env: {
        NODE_ENV: "production",
        // backend 监听端口 (与 server.js 的 BACKEND_URL 一致).
        PORT: 8089,
        // MYSQL_* / JWT_SECRET 走 backend/.env (require('dotenv').config() 自动加载).
      },
    },

    /* ============================================================
     * 3) lan-frontend — Next.js production (3302)
     *    - 跑 npm run start (frontend/ 下, package.json start 钉死 -p 3302)
     *    - 启动前必须先 cd frontend && npm run build 产出 .next/
     *    - 部署脚本 deploy-app.sh 负责 build, 这里只起进程.
     * ========================================================== */
    {
      name: "lan-frontend",
      // Next.js 推荐用 npm 启动, 直接写 node_modules/.bin/next 也行, 这里用 npm
      // 是为了让 npm 把 NODE_ENV 等透传更稳.
      script: "npm",
      args: "run start",
      cwd: "/var/www/lan-system/frontend",
      instances: 1,
      exec_mode: "fork",
      // 显式禁止 turbopack watch (production start 不需要).
      node_args: ["--max-old-space-size=1024"],

      out_file: "/var/log/lan-system/lan-frontend-out.log",
      error_file: "/var/log/lan-system/lan-frontend-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: "15s",
      max_memory_restart: "1500M",

      env: {
        NODE_ENV: "production",
        // 注意: Next.js 启动端口由 frontend/package.json 钉死 -p 3302, 这里不再注入 PORT,
        // 避免双重配置漂移. 如未来要改端口, 同时改 package.json 和 ecosystem.config.js.
        // 转发到后端 API 的地址 (Next.js rewrites 也可, 这里冗余配置).
        BACKEND_URL: "http://127.0.0.1:8089",
      },
    },
  ],

  /* ================================================================
   * deploy 段 (PM2 >= 5.x)
   *   - 集中配置 base path / log 路径, app 段通过 deploy 引用
   *   - 当前未启用 (我们走手动 pm2 reload), 留作未来 CI/CD 接入参考
   * ============================================================== */
  // deploy: {
  //   production: {
  //     user: "www-data",
  //     host: ["lan-system-prod"],
  //     ref: "origin/main",
  //     repo: "git@github.com:org/lan-system.git",
  //     path: "/var/www/lan-system",
  //     "post-deploy":
  //       "npm install && " +
  //       "cd backend && npm install && npm run build && cd .. && " +
  //       "cd frontend && npm install && npm run build && cd .. && " +
  //       "pm2 startOrReload ecosystem.config.js --env production",
  //   },
  // },
};
