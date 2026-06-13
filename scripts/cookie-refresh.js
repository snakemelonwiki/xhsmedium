#!/usr/bin/env node
/**
 * cookie-refresh: 定时刷新小红书/抖音的 Playwright Cookies，保持登录态活性。
 *
 * 用法：
 *   node scripts/cookie-refresh.js           # 启动定时刷新（后台运行）
 *   node scripts/cookie-refresh.js --once      # 只执行一次立即刷新
 *   node scripts/cookie-refresh.js --stop      # 停止后台进程（通过 PID 文件）
 *
 * 刷新策略：
 *   - 每 3-6 小时随机刷新一次（避免固定时间被平台风控）
 *   - 两个平台独立刷新，时间错开 15-30 分钟
 *   - 每次刷新：打开浏览器 → 访问首页 → 等待 5-10 秒 → 关闭
 *
 * 日志：
 *   - 控制台输出 + 写入 .playwright-profiles/cookie-refresh.log
 *   - 日志保留最近 7 天，自动轮转
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PROFILE_ROOT = path.join(PROJECT_ROOT, ".playwright-profiles");
const LOG_FILE = path.join(PROFILE_ROOT, "cookie-refresh.log");
const PID_FILE = path.join(PROFILE_ROOT, "cookie-refresh.pid");

// ── 配置 ─────────────────────────────────────────────────────────
const CONFIG = {
  // 刷新间隔范围（分钟）
  intervalMin: 3 * 60, // 3 小时
  intervalMax: 6 * 60, // 6 小时
  // 两个平台之间的错开时间（秒）
  staggerMin: 10,   //
  staggerMax: 30,   //
  // 每次刷新在页面停留时间（毫秒）
  visitMinMs: 5000,
  visitMaxMs: 10000,
  // 重试次数
  maxRetries: 2,
};

const PLATFORMS = [
  { name: "小红书", home: "https://www.xiaohongshu.com/" },
  { name: "抖音", home: "https://www.douyin.com/" },
];

// ── 日志 ──────────────────────────────────────────────────────────
function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

// ── 清理旧日志（保留 7 天） ────────────────────────────────────────
function rotateLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    const ageDays = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      fs.writeFileSync(LOG_FILE, "");
      log("INFO", "日志已轮转（超过 7 天）");
    }
  } catch {}
}

// ── 随机数工具 ────────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(minMs, maxMs) {
  return new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs)));
}

// ── 清理单例锁 ──────────────────────────────────────────────────
function clearSingletonLocks(profileDir) {
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch {}
  }
}

// ── 刷新单个平台的 Cookies ────────────────────────────────────────
async function refreshPlatform(platform) {
  const profileDir = path.join(PROFILE_ROOT, platform.name === "抖音" ? "douyin" : "xiaohongshu");

  // 如果没有 profile，跳过（说明从未登录过）
  if (!fs.existsSync(profileDir)) {
    log("WARN", `${platform.name} profile 不存在，跳过刷新`);
    return { ok: false, platform: platform.name, reason: "profile_not_found" };
  }

  log("INFO", `开始刷新 ${platform.name} Cookies...`);
  let ctx;
  let page;
  let retries = 0;

  while (retries <= CONFIG.maxRetries) {
    try {
      clearSingletonLocks(profileDir);

      ctx = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: { width: 1440, height: 1100 },
        args: [
          "--disable-remote-fonts",
          "--disable-blink-features=AutomationControlled",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });

      page = ctx.pages()[0] || (await ctx.newPage());
      await page.goto(platform.home, { waitUntil: "domcontentloaded", timeout: 15000 });

      // 随机停留 5-10 秒，模拟真实浏览
      const stayMs = randomInt(CONFIG.visitMinMs, CONFIG.visitMaxMs);
      await randomDelay(stayMs, stayMs);

      // 验证 cookies 是否写入
      const cookies = await ctx.cookies();
      const hasSession = cookies.some(
        (c) => c.name.includes("session") || c.name.includes("token") || c.name.includes("passport")
      );

      await ctx.close();
      log("INFO", `${platform.name} Cookies 刷新完成（session cookie 存在=${hasSession}）`);
      return { ok: true, platform: platform.name, cookiesCount: cookies.length, hasSession };
    } catch (err) {
      retries++;
      log("WARN", `${platform.name} 刷新失败 (attempt=${retries}): ${err?.message || err}`);
      if (ctx) {
        try { await ctx.close(); } catch {}
      }
      if (retries > CONFIG.maxRetries) {
        log("ERROR", `${platform.name} 刷新失败，已达最大重试次数`);
        return { ok: false, platform: platform.name, error: err?.message || String(err) };
      }
      // 重试前等待 5-10 秒
      await randomDelay(5000, 10000);
    }
  }
}

// ── 执行一轮刷新 ─────────────────────────────────────────────────
async function refreshAll() {
  rotateLog();
  log("INFO", "=== 开始新一轮 Cookies 刷新 ===");
  const results = [];

  for (let i = 0; i < PLATFORMS.length; i++) {
    const result = await refreshPlatform(PLATFORMS[i]);
    results.push(result);
    // 两个平台之间错开 15-30 分钟
    if (i < PLATFORMS.length - 1) {
      const staggerMs = randomInt(CONFIG.staggerMin * 60 * 1000, CONFIG.staggerMax * 60 * 1000);
      log("INFO", `等待 ${Math.round(staggerMs / 1000 / 60)} 分钟后刷新下一个平台...`);
      await randomDelay(staggerMs, staggerMs);
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  log("INFO", `本轮刷新完成: ${successCount}/${results.length} 个平台成功`);

  // 安排下一次刷新
  const nextDelayMs = randomInt(CONFIG.intervalMin * 60 * 1000, CONFIG.intervalMax * 60 * 1000);
  const nextTime = new Date(Date.now() + nextDelayMs);
  log("INFO", `下次刷新时间: ${nextTime.toISOString()}（${Math.round(nextDelayMs / 1000 / 60)} 分钟后）`);
  scheduleNext(nextDelayMs);
}

// ── 定时调度 ──────────────────────────────────────────────────────
let timer = null;

function scheduleNext(delayMs) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    refreshAll().catch((err) => {
      log("ERROR", `刷新任务未捕获异常: ${err?.stack || err}`);
      // 即使失败也继续调度
      scheduleNext(30 * 60 * 1000); // 30 分钟后重试
    });
  }, delayMs);
}

// ── PID 文件管理 ─────────────────────────────────────────────────
function writePidFile() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {}
}

function removePidFile() {
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {}
}

function readPidFile() {
  try {
    return fs.readFileSync(PID_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

// ── 停止后台进程 ─────────────────────────────────────────────────
function stopDaemon() {
  const pid = readPidFile();
  if (!pid) {
    log("WARN", "PID 文件不存在，可能未在后台运行");
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
    // 单次执行，不进入定时循环
    await refreshAll();
    return;
  }

  // 默认：启动定时刷新守护进程
  log("INFO", "Cookies 定时刷新守护进程启动");
  log("INFO", `刷新间隔: ${CONFIG.intervalMin}-${CONFIG.intervalMax} 分钟（随机）`);
  log("INFO", `PID: ${process.pid}`);

  writePidFile();

  // 进程退出时清理
  process.on("SIGINT", () => {
    log("INFO", "收到 SIGINT，退出守护进程");
    removePidFile();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("INFO", "收到 SIGTERM，退出守护进程");
    removePidFile();
    process.exit(0);
  });

  // 立即执行第一轮
  await refreshAll();
}

main().catch((err) => {
  log("ERROR", `主进程异常: ${err?.stack || err}`);
  removePidFile();
  process.exit(1);
});
