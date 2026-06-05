/**
 * 抓取小红书 / 抖音帖子互动数据（CLI 版，带重试 + 截图落盘）
 *
 * 用法：
 *   node scripts/fetch-link-metrics.js <url>                          # 默认重试 3 次
 *   node scripts/fetch-link-metrics.js <url> --retry=5 --timeout=30000
 *   node scripts/fetch-link-metrics.js <url> --headed                # 有头调试（看得到窗口）
 *   node scripts/fetch-link-metrics.js <url> --screenshot             # 把全页截图存到 debug-output/
 *
 * 跟 debug-link.js 的区别：
 *   - debug-link.js：直连 metricsFetcher，不重试、不分类
 *   - fetch-link-metrics.js（这个）：走 parser-core 的 fetchWithRetry，自动重试 + 错误分类
 */

const path = require("path");
const fs = require("fs");
const parserCore = require("./parser-core");

function arg(name, def) {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  if (found) return found.slice(flag.length);
  return def;
}

const url = process.argv[2];
const retry = Math.max(0, Number(arg("retry", 3)));
const timeout = Math.max(1000, Number(arg("timeout", 20000)));
const headed = process.argv.includes("--headed");
const wantScreenshot = process.argv.includes("--screenshot");

if (!url) {
  console.error("用法: node scripts/fetch-link-metrics.js <url> [--retry=3] [--timeout=20000] [--headed] [--screenshot]");
  process.exit(1);
}

const platform = parserCore.detectPlatform(url);
if (!platform) {
  console.error("暂不支持该平台（仅支持 小红书 / 抖音）");
  process.exit(1);
}

const outDir = path.join(__dirname, "..", "debug-output");
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  console.log(`platform: ${platform}`);
  console.log(`url:      ${url}`);
  console.log(`retry:    ${retry}`);
  console.log(`timeout:  ${timeout}ms`);
  console.log(`headed:   ${headed}`);
  console.log(`---`);

  const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
  const result = await parserCore.fetchWithRetry(url, { retry, timeout, log });

  if (!result.ok) {
    console.log(`FAIL  code=${result.error.code} retryable=${result.error.retryable}`);
    console.log(`      message: ${result.error.message}`);
    process.exit(2);
  }

  const d = result.data;
  console.log(`OK    platform:  ${d.platform}`);
  console.log(`      title:     ${d.title}`);
  console.log(`      likes:     ${d.likes}`);
  console.log(`      comments:  ${d.comments}`);
  console.log(`      favorites: ${d.favorites}`);
  console.log(`      shares:    ${d.shares}`);
  console.log(`      updated:   ${d.metricsUpdatedAt}`);

  if (wantScreenshot) {
    // 直接调一次 fetchMetricsFromUrl 拿 page 实例 —— 单纯为了截图，不优雅但能跑
    const { chromium } = require("playwright");
    const profileDir = path.join(__dirname, "..", ".playwright-profiles", platform === "抖音" ? "douyin" : "xiaohongshu");
    for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      try { fs.rmSync(path.join(profileDir, name), { force: true, recursive: true }); } catch {}
    }
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: !headed,
      viewport: { width: 1440, height: 1100 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    try {
      const page = context.pages()[0] || (await context.newPage());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const png = path.join(outDir, `${platform}-${stamp}.png`);
      const txt = path.join(outDir, `${platform}-${stamp}.txt`);
      await page.screenshot({ path: png, fullPage: true }).catch(() => {});
      const title = await page.title().catch(() => "");
      const body = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 3000);
      fs.writeFileSync(txt, [`title: ${title}`, "", body].join("\n"), "utf8");
      console.log(`---`);
      console.log(`screenshot: ${png}`);
      console.log(`text_dump:  ${txt}`);
    } finally {
      await context.close();
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
