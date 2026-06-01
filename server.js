// server.js — legacy 端口反向代理 + 前端静态资源
//
// 业务路由全部由 NestJS（端口 8089）承担。本进程只负责：
//   1. PORT (默认 3000): 反代 /api 与 /socket.io 到 NestJS，并服务 public/ 老前端静态文件（兼容旧链接）
//   2. OWNER_PORT (默认 3001): 反代 /api 与 /socket.io；其他路径 302 重定向到新前端 /owner
//      —— 老的 owner UI 已迁移到 Next.js (/owner)，本端口仅作为兼容入口
//   3. 服务 /uploads/ 静态文件（NestJS 写入的引流图片由这里读出）
//
// 历史业务逻辑已迁移到 backend/src/，请勿在本文件新增业务代码。

const express = require("express");
const path = require("path");
const proxy = require("express-http-proxy");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const OWNER_PORT = Number(process.env.OWNER_PORT || 3001);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8089";
// 新前端入口（Next.js）。默认假设与本进程同主机的 3002 端口；可通过 env 覆盖。
const FRONTEND_PUBLIC_URL = process.env.FRONTEND_PUBLIC_URL || "http://localhost:3002";
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

function mountApiProxy(app) {
  app.use("/api", proxy(BACKEND_URL, {
    proxyReqPathResolver: (req) => `/api${req.url}`,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // 把原始端口透传给后端，否则 backend 看到的 socket.localPort 永远是 8089
      // 后端 auth.service.login() 据此判断 owner 端口
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers["x-origin-port"] = String(srcReq.socket.localPort || "");
      return proxyReqOpts;
    },
    proxyErrorHandler: (err, res, next) => {
      if (err && err.code === "ECONNREFUSED") {
        return res.status(503).json({ message: "后端服务不可用，请稍后再试" });
      }
      return next(err);
    },
    parseReqBody: false,
    limit: "10mb",
  }));

  app.use("/socket.io", proxy(BACKEND_URL, {
    proxyReqPathResolver: (req) => `/socket.io${req.url}`,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers["x-origin-port"] = String(srcReq.socket.localPort || "");
      return proxyReqOpts;
    },
    proxyErrorHandler: (err, res, next) => {
      if (err && err.code === "ECONNREFUSED") {
        return res.status(503).end("backend unavailable");
      }
      return next(err);
    },
  }));
}

// ---------- PORT (3000)：兼容旧前端 ----------
const legacyApp = express();
mountApiProxy(legacyApp);
legacyApp.use("/uploads", express.static(UPLOAD_DIR));
legacyApp.use(express.static(PUBLIC_DIR));
legacyApp.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});
legacyApp.listen(PORT, "0.0.0.0", () => {
  console.log(`legacy proxy 已启动: http://0.0.0.0:${PORT} -> ${BACKEND_URL}`);
});

// ---------- OWNER_PORT (3001)：仅做兼容入口，重定向到新前端 ----------
if (OWNER_PORT !== PORT) {
  const ownerApp = express();
  mountApiProxy(ownerApp);
  // 健康检查保留，方便部署侧探活
  ownerApp.get("/healthz", (_req, res) => res.json({ ok: true, owner: true }));
  // 其他全部 302 跳新前端 owner 落地页
  ownerApp.get("*", (_req, res) => {
    const target = `${FRONTEND_PUBLIC_URL.replace(/\/$/, "")}/owner`;
    res.redirect(302, target);
  });
  ownerApp.listen(OWNER_PORT, "0.0.0.0", () => {
    console.log(`owner port 已启动: http://0.0.0.0:${OWNER_PORT} -> 302 ${FRONTEND_PUBLIC_URL}/owner`);
  });
}
