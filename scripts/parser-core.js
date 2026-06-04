/**
 * parser-core: 抓取小红书/抖音帖子指标的纯函数核心（无 I/O、无副作用注入）
 * CLI 工具和 NestJS 服务共用这一份。
 *
 * API：
 *   const { detectPlatform, fetchWithRetry, classifyError } = require("./parser-core");
 *
 *   const result = await fetchWithRetry(url, { retry, timeout, log });
 *   // result = { ok: true, data: { platform, title, likes, ... } }
 *   //      | { ok: false, error: { code, retryable, message, platform } }
 */

const path = require("path");
const fs = require("fs");

// env 必须在 require("playwright") 之前（Playwright require 时锁定 executablePath）
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  if (process.platform === "win32") {
    const dDrive = "D:\\playwright-browsers";
    if (fs.existsSync(dDrive)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = dDrive;
    }
  }
}

const { detectPlatform, fetchMetricsFromUrl, openLoginBrowser, closeLoginBrowser, getLoginStatus } = require("../metricsFetcher");

const TRANSIENT_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ERR_NETWORK_CHANGED/i,
  /net::ERR_/i,
  /TimeoutError/i,
  /Navigation timeout/i,
  /waitForTimeout/i,
  /抓取失败/,
];

const LOGIN_WALL_PATTERNS = [/登录页/, /登录后/, /未登录/, /login_required/i];

const PLAYWRIGHT_MISSING_PATTERNS = [
  /Executable doesn't exist/i,
  /playwright install/i,
  /chromium-/i,
];

function classifyError(err) {
  const msg = err?.message || String(err);
  if (PLAYWRIGHT_MISSING_PATTERNS.some((re) => re.test(msg))) {
    return { code: "playwright_missing", retryable: false, message: msg };
  }
  if (LOGIN_WALL_PATTERNS.some((re) => re.test(msg))) {
    return { code: "login_required", retryable: false, message: msg };
  }
  if (TRANSIENT_PATTERNS.some((re) => re.test(msg))) {
    return { code: "transient", retryable: true, message: msg };
  }
  return { code: "unknown", retryable: false, message: msg };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, { retry = 3, timeout = 20000, log = () => {} } = {}) {
  const platform = detectPlatform(url);
  if (!platform) {
    return {
      ok: false,
      error: { code: "platform_unsupported", retryable: false, message: "URL 不属于小红书或抖音", platform: "" },
    };
  }

  let lastErr;
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      log(`重试 ${attempt}/${retry}，等待 ${backoff}ms 后重试`);
      await sleep(backoff);
    }
    try {
      log(`第 ${attempt + 1} 次抓取 ${platform}: ${url}`);
      const data = await fetchMetricsFromUrl(url);
      return {
        ok: true,
        data: {
          platform: data.platform || platform,
          title: data.title || "",
          likes: Number(data.likes || 0),
          comments: Number(data.comments || 0),
          favorites: Number(data.favorites || 0),
          shares: Number(data.shares || 0),
          metricsUpdatedAt: data.metricsUpdatedAt || new Date().toISOString(),
        },
      };
    } catch (err) {
      lastErr = err;
      const cls = classifyError(err);
      log(`第 ${attempt + 1} 次失败 [${cls.code}]: ${cls.message}`);
      if (!cls.retryable || attempt === retry) {
        return { ok: false, error: { ...cls, platform } };
      }
    }
  }
  return {
    ok: false,
    error: { code: "exhausted", retryable: false, message: lastErr?.message || "重试用尽", platform },
  };
}

module.exports = {
  detectPlatform,
  classifyError,
  fetchWithRetry,
  openLoginBrowser,
  closeLoginBrowser,
  getLoginStatus,
};
