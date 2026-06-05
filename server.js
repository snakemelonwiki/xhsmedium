// server.js — legacy 端口反向代理 + 前端静态资源
//
// 业务路由全部由 NestJS（端口 8089）承担。本进程只负责：
//   1. PORT (默认 3000): 反代 /api 与 /socket.io 到 NestJS，并服务 public/ 老前端静态文件（兼容旧链接）
//   2. OWNER_PORT (默认 3001): 反代 /api 与 /socket.io；其他路径 302 重定向到新前端 /owner
//      —— 老的 owner UI 已迁移到 Next.js (/owner)，本端口仅作为兼容入口
//   3. 服务 /uploads/ 静态文件（NestJS 写入的引流图片由这里读出）
//
// 历史业务逻辑已迁移到 backend/src/，请勿在本文件新增业务代码。
//
// === B7 端口隔离修复（2026-06-03）===
// 旧版本 server.js 仅在 OWNER_PORT !== PORT 时启动 owner 反代，但不强制 role 校验，
// 导致 sales/academic/staff 等角色 token 都能 200 访问 3001 端口；owner token 也能
// 反向访问 3000 端口。本版本在反代之前加 Express 中间件做端口-角色强校验：
//   * PORT (3000)：除 owner 外的所有已登录 token 都可访问；owner 角色被拒
//   * OWNER_PORT (3001)：仅 owner / admin / supervisor 可访问；其他角色被拒
// 校验失败返回 403，前端 axios 拦截器可基于此提示「请使用对应入口登录」。

const express = require("express");
const path = require("path");
const proxy = require("express-http-proxy");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3000);
const OWNER_PORT = Number(process.env.OWNER_PORT || 3001);
// v1.3：统一登录入口端口（与新前端 Next.js 占用的 3002 错开，默认 3003）
const ALL_ROLES_PORT = Number(process.env.ALL_ROLES_PORT || 3003);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8089";
// 新前端入口（Next.js）。默认假设与本进程同主机的 3002 端口；可通过 env 覆盖。
const FRONTEND_PUBLIC_URL = process.env.FRONTEND_PUBLIC_URL || "http://localhost:3002";
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// === v1.3 多端口矩阵（2026-06-04）===
//  * PORT (3000)            — 销售/教务/员工/主管/管理员（不含 owner）
//  * OWNER_PORT (3001)      — 仅 owner（B7 后原 admin/supervisor 改走 ALL_ROLES_PORT 3003）
//  * ALL_ROLES_PORT (3003)  — 统一登录入口；除 owner 外全角色放行（owner 仍必须 3001）
// 3002 端口被新前端 Next.js (frontend/package.json dev/start 脚本) 占用，故
// 统一登录入口从 3003 起；如未来 Next.js 改端口，ALL_ROLES_PORT 也可下调到 3002。
// 详见 `doc/修复说明-端口体系-v1.3.md`。
// B7：owner 端口白名单收紧为「仅 owner」（admin/supervisor 改走 3003 统一登录）
const ALLOWED_OWNER_ROLES = ["owner"];

/**
 * 解析 Authorization: Bearer <token>，返回 token 字符串；无则返回 null
 */
function extractBearerToken(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * 解析 JWT payload（不解签名校验，仅做 base64 解析读 role 字段做快速判断）。
 * 真实签名校验交给 NestJS 端 AuthGuard（server.js 这层不替代）。
 * 如果 token 不是合法 JWT 格式，返回 null。
 */
function peekRoleFromJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);
    return payload && payload.role ? String(payload.role) : null;
  } catch (_err) {
    return null;
  }
}

/**
 * B7 PORT (3000) 中间件：禁止 owner 角色从主入口访问。
 * - 未带 token：放行（交给 NestJS AuthGuard 决定 401）
 * - 角色非 owner：放行
 * - 角色是 owner：返回 403 forbidden_owner_use_3001
 */
function mainPortAuthMiddleware(req, res, next) {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
    return next();
  }
  const token = extractBearerToken(req);
  if (!token) {
    // 未登录透传给 NestJS（login 路由是 public，会被 AuthGuard 放过）
    return next();
  }
  const role = peekRoleFromJwt(token);
  if (role === "owner") {
    // eslint-disable-next-line no-console
    console.warn(
      `[B7][MAIN-PORT] 拒绝 owner 角色访问 3000 端口 (path=${req.path}, remote=${req.ip})`,
    );
    return res.status(403).json({
      ok: false,
      error: "forbidden_owner_use_3001",
      message: "owner 账号必须从 3001 端口（总后台）登录",
    });
  }
  return next();
}

/**
 * B7 OWNER_PORT (3001) 中间件：v1.3 起仅 owner 可访问（admin/supervisor 改走 ALL_ROLES_PORT 3003）。
 * - 未带 token：放行（login 路由是 public）
 * - 角色在白名单内：放行
 * - 角色不在白名单：返回 403 forbidden_owner_port_only，文案区分「请走 3003」vs「仅 owner 可访问」
 */
function ownerPortAuthMiddleware(req, res, next) {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
    return next();
  }
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }
  const role = peekRoleFromJwt(token);
  if (!role) {
    // token 不是合法 JWT 格式（可能是 legacyToken 等），让 NestJS 端去拒绝
    return next();
  }
  if (!ALLOWED_OWNER_ROLES.includes(role)) {
    // v1.3：admin/supervisor 引导到 3003 统一登录；其它角色仍是「仅 owner」
    const isAdminLike = role === "admin" || role === "supervisor";
    const message = isAdminLike
      ? "请使用 3003 端口（统一登录入口）登录后，再进入总后台"
      : "3001 端口仅 owner 角色可访问";
    // eslint-disable-next-line no-console
    console.warn(
      `[B7][OWNER-PORT] 拒绝角色 ${role} 访问 3001 端口 (path=${req.path}, remote=${req.ip})`,
    );
    return res.status(403).json({
      ok: false,
      error: "forbidden_owner_port_only",
      message,
      role,
      redirectPort: isAdminLike ? ALL_ROLES_PORT : undefined,
    });
  }
  return next();
}

/**
 * v1.3 ALL_ROLES_PORT (3003) 统一登录入口中间件。
 * 该端口不进行端口-角色 L1 拦截（业务路由都放行到 NestJS），由 NestJS auth.service.login
 * 在 L2 阶段对 owner 做单独拒绝（owner 仍必须走 3001）。
 * 这里仍保留最小占位：将来若需要在该端口加 IP 白名单 / 频控，可直接扩展。
 */
function allRolesPortAuthMiddleware(req, _res, next) {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/socket.io")) {
    return next();
  }
  return next();
}

function mountApiProxy(app) {
  app.use("/api", proxy(BACKEND_URL, {
    proxyReqPathResolver: (req) => `/api${req.url}`,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      // 把原始端口透传给后端，否则 backend 看到的 socket.localPort 永远是 8089
      // 后端 auth.service.login() 据此判断 owner 端口
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      proxyReqOpts.headers["x-origin-port"] = String(srcReq.socket.localPort || "");
      // B7：把当前 server.js 进程实际监听的端口也透传，方便 NestJS AuthGuard
      // 路由级做「role 必须在对应端口」的二次校验
      proxyReqOpts.headers["x-server-port"] = String(srcReq.socket.localPort || "");
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
      proxyReqOpts.headers["x-server-port"] = String(srcReq.socket.localPort || "");
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
// B7：先挂中间件，再挂反代 —— 中间件直接 return 403 时不会触发 NestJS
legacyApp.use(mainPortAuthMiddleware);
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
  // B7：先挂中间件，再挂反代 + 重定向
  ownerApp.use(ownerPortAuthMiddleware);
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

// ---------- ALL_ROLES_PORT (3003，v1.3)：统一登录入口 ----------
// 与 PORT (3000) 行为一致：反代 /api + /socket.io + 服务 public/ 老前端静态。
// 区别在于 server.js 不做端口-角色拦截（所有角色都放行），由 NestJS auth.service.login
// 在 L2 阶段拒绝 owner（owner 必须从 3001 登录）。其他角色 200 OK。
if (ALL_ROLES_PORT !== PORT && ALL_ROLES_PORT !== OWNER_PORT) {
  const allRolesApp = express();
  allRolesApp.use(allRolesPortAuthMiddleware);
  mountApiProxy(allRolesApp);
  allRolesApp.use("/uploads", express.static(UPLOAD_DIR));
  allRolesApp.use(express.static(PUBLIC_DIR));
  allRolesApp.get("*", (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  allRolesApp.listen(ALL_ROLES_PORT, "0.0.0.0", () => {
    console.log(`all-roles port 已启动: http://0.0.0.0:${ALL_ROLES_PORT} (统一登录入口，全角色放行；owner 仍走 ${OWNER_PORT})`);
  });
}

// v1.3 启动总览：打印三端口矩阵
const matrix = [
  `  PORT=${PORT}            -> 主入口（owner 拒绝）`,
  `  OWNER_PORT=${OWNER_PORT}      -> 仅 owner`,
  `  ALL_ROLES_PORT=${ALL_ROLES_PORT}  -> 统一登录入口（owner 仍走 ${OWNER_PORT}）`,
];
console.log(`[v1.3] 多端口矩阵:\n${matrix.join("\n")}`);
