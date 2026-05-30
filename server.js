// server.js — legacy 端口反向代理 + 前端静态资源
//
// 业务路由全部由 NestJS（端口 8089）承担。本进程只负责：
//   1. 在 PORT / OWNER_PORT 上监听，把 /api/* 反代到 NestJS
//   2. 服务 public/ 静态文件和 SPA 兜底
//   3. 服务 /uploads/ 静态文件（NestJS 写入的引流图片由这里读出）
//
// 历史业务逻辑已迁移到 backend/src/，请勿在本文件新增业务代码。

const express = require("express");
const path = require("path");
const proxy = require("express-http-proxy");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OWNER_PORT = Number(process.env.OWNER_PORT || 3001);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8089";
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

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

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`legacy proxy 已启动: http://0.0.0.0:${PORT} -> ${BACKEND_URL}`);
});

if (OWNER_PORT !== PORT) {
  app.listen(OWNER_PORT, "0.0.0.0", () => {
    console.log(`legacy proxy(owner) 已启动: http://0.0.0.0:${OWNER_PORT} -> ${BACKEND_URL}`);
  });
}
