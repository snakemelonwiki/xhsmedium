/**
 * capture-har.js
 *
 * 使用 Playwright 抓取目标 URL 的网络流量并保存 HAR 快照，
 * 供后续分析脚本消费，以诊断和优化抖音帖子数据提取。
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ── 配置 ─────────────────────────────────────────────────────────
// 支持通过 CLI 传入目标 URL：node capture-har.js <url>
const TARGET_URL = process.argv[2] || "https://v.douyin.com/BuzcQMqz1qM/";
const OUTPUT_DIR = path.resolve(__dirname, "output");
const HAR_PATH = path.join(OUTPUT_DIR, "captured-har.json");
const HTML_PATH = path.join(OUTPUT_DIR, "page-html.html");
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "page-screenshot.png");

// 拦截白名单：记录这些响应（其余排除静态资源）
const RECORD_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "xhr",
  "fetch",
  "other",
]);

// ── 工具函数 ─────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 尝试将响应体解析为 JSON（含 base64 包装）。
 * 注意：response.json() 和 response.text() 是互斥的，
 * 只能调用其中一个。先尝试 JSON，失败后再尝试文本。
 */
async function tryParseJsonBody(response) {
  const ct = ((response.headers()["content-type"] || "") + "").toLowerCase();
  if (ct.includes("application/json")) {
    // 先读取文本，避免 json() 消费后 text() 不可用
    let text;
    try {
      text = await response.text();
    } catch {
      return {};
    }
    try {
      const jsonBody = JSON.parse(text);
      return { jsonBody };
    } catch {
      return { textBody: text, jsonBody: tryDecodeBase64Json(text) };
    }
  } else if (ct.includes("text/html")) {
    try {
      const text = await response.text();
      return { textBody: text };
    } catch {
      return {};
    }
  }
  return {};
}

function tryDecodeBase64Json(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) return null;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (!decoded || decoded.includes("�")) return null;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ── HAR 捕获器 ──────────────────────────────────────────────────
class HarCollector {
  constructor(page, opts = {}) {
    this.page = page;
    this.entries = [];
    this.maxEntries = opts.maxEntries || 300;
    this.urlFilter = opts.urlFilter || null;
    this.handler = (response) => this.onResponse(response).catch(() => {});
  }

  start() {
    this.page.on("response", this.handler);
    this.startedAt = Date.now();
  }

  stop() {
    this.page.off("response", this.handler);
    this.finishedAt = Date.now();
    return {
      entries: [...this.entries],
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      summary: {
        total: this.entries.length,
        byContentType: this.entries.reduce((acc, e) => {
          const type = e.contentType.split(";")[0].trim() || "unknown";
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  async onResponse(response) {
    if (this.entries.length >= this.maxEntries) return;

    const request = response.request();
    const resourceType = request.resourceType();

    if (!RECORD_RESOURCE_TYPES.has(resourceType)) return;

    const url = response.url();
    const status = response.status();

    if (status < 200 || status >= 300) return;

    const ct = (response.headers()["content-type"] || "").toLowerCase();

    // URL 过滤（如果有的话）
    if (this.urlFilter && !ct.includes("text/html")) {
      if (!this.urlFilter.some((re) => re.test(url))) return;
    }

    const body = await tryParseJsonBody(response);
    if (!body || Object.keys(body).length === 0) return;

    const entry = {
      url,
      method: request.method(),
      status,
      contentType: ct,
      resourceType,
      timestamp: Date.now(),
      ...body,
    };

    this.entries.push(entry);
  }
}

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  ensureDir(OUTPUT_DIR);

  console.log(`[capture-har] 启动浏览器，准备抓取: ${TARGET_URL}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // 拦截 websocket/eventsource
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "websocket" || type === "eventsource") {
        route.abort();
      } else {
        route.continue();
      }
    });

    // 挂载 HAR 收集器
    const harCollector = new HarCollector(page, {
      maxEntries: 300,
      urlFilter: [
        // 抖音
        /\/aweme\/v1\/web\/aweme\/detail\//i,
        /\/aweme\/v1\/web\/aweme\/post\//i,
        /\/aweme\/v1\/web\/aweme\/related\//i,
        /\/aweme\/v2\/web\/aweme\/stats\//i,
        /RENDER_DATA/i,
        // 小红书
        /\/api\/sns\/web\/v[12]\/feed/i,
        /\/api\/sns\/web\/v\d+\/note\b/i,
      ],
    });
    harCollector.start();

    // 导航
    console.log(`[capture-har] 导航到目标 URL...`);
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // 等待页面稳定
    console.log(`[capture-har] 等待网络空闲...`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 获取最终 URL
    const finalUrl = page.url();
    console.log(`[capture-har] 最终 URL: ${finalUrl}`);

    // 停止 HAR 收集
    const harSnapshot = harCollector.stop();
    harSnapshot.finalUrl = finalUrl;

    // 保存页面 HTML（用于 SSR 数据提取）
    const pageHtml = await page.content().catch(() => "");
    fs.writeFileSync(HTML_PATH, pageHtml, "utf8");
    console.log(`[capture-har] 页面 HTML 已保存: ${HTML_PATH}`);

    // 截图
    await page.screenshot({ type: "png", path: SCREENSHOT_PATH, fullPage: true }).catch((err) => {
      console.warn(`[capture-har] 截图失败: ${err.message || err}`);
    });
    console.log(`[capture-har] 页面截图已保存: ${SCREENSHOT_PATH}`);

    // 保存 HAR 快照
    fs.writeFileSync(HAR_PATH, JSON.stringify(harSnapshot, null, 2), "utf8");
    console.log(`[capture-har] HAR 快照已保存: ${HAR_PATH}`);
    console.log(`[capture-har] 共捕获 ${harSnapshot.entries.length} 条响应`);

    // 打印摘要
    console.log("\n[摘要] 按 Content-Type 分布:");
    const summaryEntries = Object.entries(harSnapshot.summary.byContentType);
    summaryEntries.sort((a, b) => (b[1] > a[1] ? 1 : -1));
    for (const [type, count] of summaryEntries) {
      console.log(`  - ${type}: ${count}`);
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log("[capture-har] 浏览器已关闭");
    }
  }
}

main().catch((err) => {
  console.error("[capture-har] 错误:", err);
  process.exit(1);
});
