#!/usr/bin/env node
/**
 * posts-metrics-refresh: 定时刷新所有作品的点赞/评论/收藏/分享数量
 *
 * 用法：
 *   node scripts/posts-metrics-refresh.js --once      # 立即执行一次（单线程，逐个刷新）
 *   node scripts/posts-metrics-refresh.js --daemon     # 启动守护进程（48±6h 循环）
 *   node scripts/posts-metrics-refresh.js --stop      # 停止守护进程
 *
 * 防风控策略：
 *   - 2 天为最低容忍时效（MIN_INTERVAL_HOURS）
 *   - 单线程逐个刷新，间隔 5-15s 随机
 *   - 每 5 个作品后休息 60-120s
 *   - 仅刷新有 post_url 的作品
 *   - 后端抓取内部已自带 2 次指数退避重试，脚本层不再额外重试
 *   - 优先刷新指标全为 0 的作品，其次按更新时间升序（最久未更新优先）
 *   - 每轮最多刷新 MAX_POSTS_PER_BATCH 条，防止数据量过大时耗时过长
 *
 * 数据库：直接连接 MySQL（复用 .env 配置）
 * 抓取：调用后端 /api/posts/:id/internal-refresh-metrics（内部端点，仅本机可访问），复用新版解析逻辑
 */

const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const PROJECT_ROOT = path.resolve(__dirname, "..");

const LOG_FILE = path.join(PROJECT_ROOT, ".playwright-profiles", "posts-refresh.log");
const PID_FILE = path.join(PROJECT_ROOT, ".playwright-profiles", "posts-refresh.pid");
const DEFAULT_MIN_INTERVAL_HOURS = 48; // 2 天
const BACKEND_URL = String(process.env.BACKEND_URL || "http://127.0.0.1:8089").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = Number(process.env.POSTS_REFRESH_TIMEOUT_MS || 30000);
// 日志文件大小上限（bytes），超过则自动轮转
const LOG_MAX_SIZE = Number(process.env.LOG_MAX_SIZE || 10 * 1024 * 1024); // 默认 10MB
// 每轮最大刷新条数，防止数据量过大时一轮耗时过长
const MAX_POSTS_PER_BATCH = Number(process.env.MAX_POSTS_PER_BATCH || 500);

// ── 随机数工具 ────────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs, maxMs) {
  return new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs)));
}

// ── 日志 ──────────────────────────────────────────────────────────
function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > LOG_MAX_SIZE) {
        const rotated = `${LOG_FILE}.${Date.now()}.old`;
        fs.renameSync(LOG_FILE, rotated);
      }
    }
  } catch {
    // 轮转失败不影响主流程
  }
}

function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

// ── 读取 .env ─────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("找不到 .env 文件，请在项目根目录创建");
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
    // if (m) {
    //   // 去掉值两端可能存在的单/双引号
    //   let value = m[2].trim();
    //   value = value.replace(/^['"](.*)['"]$/, "$1");
    //   env[m[1]] = value;
    // }
  }
  return env;
}

// ── MySQL 连接 ────────────────────────────────────────────────────
async function getDbPool(env) {
  return mysql.createPool({
    host: env.MYSQL_HOST || "localhost",
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || "root",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "lan_dual_role_system",
    waitForConnections: true,
    connectionLimit: 2, // 仅后台刷新脚本用，不需要太多连接
    queueLimit: 0,
  });
}

// ── 查询需要刷新的作品 ────────────────────────────────────────────
async function getPostsToRefresh(pool, minIntervalHours, maxPosts = 500) {
  const cutoff = new Date(Date.now() - minIntervalHours * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 19).replace("T", " ");

  const [rows] = await pool.query(
    `
    SELECT id, post_url, title, metrics_updated_at, platform
    FROM posts
    WHERE post_url IS NOT NULL
      AND post_url != ''
      AND (metrics_updated_at IS NULL OR metrics_updated_at < ?)
    ORDER BY
      -- 优先刷新指标全部为 0 的帖子（从未抓取到有效数据或已失效）
      (likes = 0 AND comments = 0 AND favorites = 0 AND shares = 0) DESC,
      -- 然后按更新时间升序（最久未更新的优先）
      metrics_updated_at ASC,
      -- 最后以 ID 兜底，避免 NULL 导致非确定性排序
      id ASC
    LIMIT ?
    `,
    [cutoffStr, maxPosts]
  );
  return rows;
}

// ── 更新单个作品的指标 ──────────────────────────────────────────
async function updatePostMetrics(post, idx, total) {
  const { post_url, id, title } = post;
  log("INFO", `[${idx + 1}/${total}] 开始刷新: ${id} | ${title?.slice(0, 40) || "无标题"} | ${post_url || "无链接"}`);

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // 走专用的「内部刷新」端点：@Public() 无需鉴权，但 controller 内限定仅本机可访问，
    // 避免 /refresh-metrics（需登录态）被当成未鉴权写接口。
    const response = await fetch(`${BACKEND_URL}/api/posts/${encodeURIComponent(id)}/internal-refresh-metrics`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ postUrl: post_url || undefined }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutHandle));

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    if (!response.ok || !payload?.ok) {
      const errMsg = payload?.message || payload?.error?.message || `HTTP ${response.status}`;
      log("WARN", `[${idx + 1}/${total}] 刷新失败: ${id} | ${post_url || "无链接"} — ${errMsg}`);
      return { success: false, id, reason: errMsg };
    }

    const d = payload.metrics || {};

    // 校验抓取结果：如果点赞/评论/收藏/分享全为 0，视为空数据，不更新数据库
    const likesVal = Number(d.likes || 0);
    const commentsVal = Number(d.comments || 0);
    const favoritesVal = Number(d.favorites || 0);
    const sharesVal = Number(d.shares || 0);

    if (likesVal === 0 && commentsVal === 0 && favoritesVal === 0 && sharesVal === 0) {
      log("WARN", `[${idx + 1}/${total}] 抓取结果为空（全 0），跳过更新: ${id} | ${post_url || "无链接"}`);
      return { success: false, id, reason: "抓取结果为空（全 0）" };
    }

    log("INFO", `[${idx + 1}/${total}] 刷新成功: ${id} 赞${likesVal} 评${commentsVal} 藏${favoritesVal} 分享${sharesVal}`);
    return { success: true, id, likes: likesVal, comments: commentsVal, favorites: favoritesVal, shares: sharesVal };
  } catch (err) {
    const errMsg = err?.name === "AbortError"
      ? `请求超时（>${REQUEST_TIMEOUT_MS}ms）`
      : (err?.message || String(err));
    log("ERROR", `[${idx + 1}/${total}] 刷新异常: ${id} | ${post_url || "无链接"} — ${errMsg}`);
    return { success: false, id, reason: errMsg };
  }
}

// ── 后端服务健康检查 ────────────────────────────────────────────────
async function checkBackendHealth(timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${BACKEND_URL}/api`, {
      method: "HEAD",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutHandle));
    // 任意 HTTP 状态码都表示后端在线（404 也算）
    log("INFO", `后端服务健康检查通过: ${BACKEND_URL} (HTTP ${response.status})`);
    return true;
  } catch (err) {
    const reason = err?.name === "AbortError"
      ? `超时（>${timeoutMs}ms）`
      : (err?.message || String(err));
    log("ERROR", `后端服务无法连接: ${BACKEND_URL} — ${reason}`);
    return false;
  }
}

// ── 执行一轮刷新 ──────────────────────────────────────────────────
async function refreshAll() {
  log("INFO", "=== 开始作品指标刷新 ===");

  // 先检查后端连通性，避免连接不上后端时白跑一轮 MySQL 查询
  const healthy = await checkBackendHealth();
  if (!healthy) {
    log("ERROR", "后端服务不可用，跳过本轮刷新");
    return { total: 0, success: 0, failed: 0, skipped: true };
  }

  const env = loadEnv();
  let pool;
  try {
    pool = await getDbPool(env);
  } catch (err) {
    log("ERROR", `数据库连接失败: ${err?.message || err}`);
    return { total: 0, success: 0, failed: 0 };
  }

  let posts;
  try {
    posts = await getPostsToRefresh(pool, DEFAULT_MIN_INTERVAL_HOURS, MAX_POSTS_PER_BATCH);
  } catch (err) {
    log("ERROR", `查询作品失败: ${err?.message || err}`);
    await pool.end();
    return { total: 0, success: 0, failed: 0 };
  }

  log("INFO", `需要刷新的作品数: ${posts.length}`);
  if (posts.length === 0) {
    log("INFO", "没有需要刷新的作品，本轮结束");
    await pool.end();
    return { total: 0, success: 0, failed: 0 };
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const result = await updatePostMetrics(posts[i], i, posts.length);
    results.push(result);
    if (result.success) successCount++;
    else failCount++;

    // 防风控：每 5 个作品后休息 60-120s
    if ((i + 1) % 5 === 0 && i < posts.length - 1) {
      const rest = randomInt(60000, 120000);
      log("INFO", `已完成 ${i + 1} 个作品，休息 ${Math.round(rest / 1000)} 秒...`);
      await randomDelay(rest, rest);
    } else if (i < posts.length - 1) {
      // 间隔 5-15s
      const delay = randomInt(5000, 15000);
      await randomDelay(delay, delay);
    }
  }

  await pool.end();
  log("INFO", `=== 刷新完成: 成功 ${successCount}/${posts.length}，失败 ${failCount} ===`);
  return { total: posts.length, success: successCount, failed: failCount };
}

// ── 守护进程循环 ──────────────────────────────────────────────────
let timer = null;

function scheduleNext() {
  const nextDelayMs = randomInt(42 * 60 * 60 * 1000, 54 * 60 * 60 * 1000); // 42-54 小时 ≈ 1.75-2.25 天
  const nextTime = new Date(Date.now() + nextDelayMs);
  log("INFO", `下次刷新时间: ${nextTime.toISOString()}（约 ${Math.round(nextDelayMs / 1000 / 60 / 60)} 小时后）`);

  timer = setTimeout(() => {
    refreshAll().catch((err) => {
      log("ERROR", `刷新任务未捕获异常: ${err?.stack || err}`);
      scheduleNext();
    });
  }, nextDelayMs);
}

// ── PID 管理 ──────────────────────────────────────────────────────
function writePidFile() {
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch {}
}

function removePidFile() {
  try { fs.rmSync(PID_FILE, { force: true }); } catch {}
}

function readPidFile() {
  try { return fs.readFileSync(PID_FILE, "utf8").trim(); } catch { return null; }
}

function stopDaemon() {
  const pid = readPidFile();
  if (!pid) {
    log("WARN", "PID 文件不存在");
    return;
  }
  try {
    process.kill(Number(pid), "SIGTERM");
    log("INFO", `已发送 SIGTERM 到进程 ${pid}`);
    removePidFile();
  } catch (err) {
    log("ERROR", `停止进程失败: ${err?.message || err}`);
  }
}

// ── 主入口 ────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--stop")) {
    stopDaemon();
    return;
  }

  if (args.includes("--once")) {
    await refreshAll();
    return;
  }

  // 默认守护模式
  log("INFO", "作品指标定时刷新守护进程启动");
  log("INFO", `最低刷新间隔: ${DEFAULT_MIN_INTERVAL_HOURS} 小时`);
  log("INFO", `PID: ${process.pid}`);
  writePidFile();

  process.on("SIGINT", () => {
    log("INFO", "收到 SIGINT，退出守护进程");
    if (timer) clearTimeout(timer);
    removePidFile();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log("INFO", "收到 SIGTERM，退出守护进程");
    if (timer) clearTimeout(timer);
    removePidFile();
    process.exit(0);
  });

  // 立即执行第一轮
  await refreshAll();
  scheduleNext();
}

main().catch((err) => {
  log("ERROR", `主进程异常: ${err?.stack || err}`);
  removePidFile();
  process.exit(1);
});
