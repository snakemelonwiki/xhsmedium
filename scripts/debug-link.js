const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { detectPlatform } = require("../metricsFetcher");

const url = process.argv[2];
const headed = process.argv.includes("--headed");

if (!url) {
  console.error("用法: node scripts/debug-link.js <作品链接> [--headed]");
  process.exit(1);
}

const platform = detectPlatform(url);
if (!platform) {
  console.error("暂时只支持小红书或抖音链接调试");
  process.exit(1);
}

const profileRoot = path.join(__dirname, "..", ".playwright-profiles");
const outDir = path.join(__dirname, "..", "debug-output");
const profileDir = path.join(profileRoot, platform === "抖音" ? "douyin" : "xiaohongshu");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
  try {
    fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
  } catch {}
}

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    viewport: { width: 1440, height: 1100 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const finalUrl = page.url();
    const title = await page.title();
    const bodyText = ((await page.locator("body").innerText().catch(() => "")) || "").trim();
    const snippet = bodyText.slice(0, 3000);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = path.join(outDir, `${platform}-${stamp}.png`);
    const textPath = path.join(outDir, `${platform}-${stamp}.txt`);

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    fs.writeFileSync(
      textPath,
      [
        `platform: ${platform}`,
        `input_url: ${url}`,
        `final_url: ${finalUrl}`,
        `title: ${title}`,
        "",
        "body_snippet:",
        snippet
      ].join("\n"),
      "utf8"
    );

    console.log(`platform: ${platform}`);
    console.log(`final_url: ${finalUrl}`);
    console.log(`title: ${title}`);
    console.log(`screenshot: ${screenshotPath}`);
    console.log(`text_dump: ${textPath}`);
    console.log("body_start");
    console.log(snippet);
    console.log("body_end");
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
