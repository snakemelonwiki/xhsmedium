#!/usr/bin/env node
/**
 * playwright-login: 打开/关闭/查询小红书或抖音的登录浏览器
 *
 * 用法：
 *   node scripts/playwright-login.js <platform>            # 启动 headful 浏览器（带 UI，需扫码）
 *   node scripts/playwright-login.js <platform> --close    # 关闭已打开的浏览器
 *   node scripts/playwright-login.js --status             # 列出 2 个平台的 profile 登录态
 *   node scripts/playwright-login.js --status <platform>  # 单平台
 *
 * 平台名：小红书 / 抖音
 *
 * 退出码：
 *   0  成功
 *   1  业务错误（无 GUI 环境 / 浏览器启动失败等）
 *   2  参数错误
 *
 * 注意：
 *   - 启动登录浏览器需要**带 GUI 的环境**（桌面系统）。服务器（无显示器）跑会失败
 *   - 登录态会持久化到 .playwright-profiles/<platform>/ 目录
 *   - 服务器可把 .playwright-profiles/ 目录 rsync/NFS 部署过去，复用登录态
 */

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const {
  openLoginBrowser,
  closeLoginBrowser,
  getLoginStatus,
} = require(path.join(ROOT, "scripts/parser-core"));

const EXIT = { OK: 0, BUSINESS: 1, USAGE: 2 };

const PLATFORMS = ["小红书", "抖音"];

function parseArgs(argv) {
  const out = { command: undefined, platform: undefined, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--close" || a === "-c") {
      out.command = "close";
    } else if (a === "--status" || a === "-s") {
      out.command = "status";
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (PLATFORMS.includes(a)) {
      out.platform = a;
    } else {
      throw new Error(`未知参数或不支持的平台: ${a}`);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "用法:",
      "  node scripts/playwright-login.js <小红书|抖音>           # 启动登录浏览器（headful）",
      "  node scripts/playwright-login.js <小红书|抖音> --close   # 关闭",
      "  node scripts/playwright-login.js --status                # 查看 2 平台登录态",
      "  node scripts/playwright-login.js --status <平台>         # 单平台",
      "",
      "前置:",
      "  - 登录浏览器需带 GUI 的环境（Windows / macOS 桌面）",
      "  - profile 目录: .playwright-profiles/<platform>/",
      "  - 服务器可 rsync 整个 .playwright-profiles/ 目录复用登录态",
      "",
      "退出码: 0 成功 / 1 业务错误 / 2 参数错误",
    ].join("\n") + "\n"
  );
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: "usage", message: err.message } }) + "\n");
    process.exit(EXIT.USAGE);
  }
  if (args.help) {
    printHelp();
    process.exit(EXIT.OK);
  }

  try {
    if (args.command === "status") {
      const platforms = args.platform ? [args.platform] : PLATFORMS;
      const items = platforms.map((p) => getLoginStatus(p));
      process.stdout.write(JSON.stringify({ ok: true, items }) + "\n");
      process.exit(EXIT.OK);
    }

    if (!args.platform) {
      process.stdout.write(JSON.stringify({ ok: false, error: { code: "usage", message: "请指定平台（小红书 / 抖音）" } }) + "\n");
      process.exit(EXIT.USAGE);
    }

    if (args.command === "close") {
      const result = await closeLoginBrowser(args.platform);
      process.stdout.write(JSON.stringify(result) + "\n");
      process.exit(result.ok ? EXIT.OK : EXIT.BUSINESS);
    }

    // 默认：启动登录浏览器
    let result;
    try {
      result = await openLoginBrowser(args.platform);
    } catch (err) {
      // headful 在无 GUI 环境会抛错（Cannot open display / GUI not available）
      const msg = err?.message || String(err);
      process.stdout.write(
        JSON.stringify({
          ok: false,
          error: { code: "open_failed", message: msg, hint: "登录浏览器需要 GUI 环境；服务器请先用本地登录后 rsync .playwright-profiles/" },
        }) + "\n"
      );
      process.exit(EXIT.BUSINESS);
    }
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.ok) {
      // 关键：保持 Node 进程存活，让 persistent context 持续（否则进程退出 → context 销毁 → 浏览器闪退）
      process.stderr.write(
        "[playwright-login] 浏览器已打开，请扫码登录。\n" +
        "[playwright-login] 登录完成后关闭浏览器窗口，再按 Ctrl+C 退出 CLI。\n"
      );
      process.on("SIGINT", () => {
        process.stderr.write("[playwright-login] 收到 SIGINT，正在关闭...\n");
        process.exit(EXIT.OK);
      });
      // 永远等待，context 保持 alive
      await new Promise(() => {});
    } else {
      process.exit(EXIT.BUSINESS);
    }
  } catch (err) {
    // 兜底：未预期异常走这里
    process.stdout.write(
      JSON.stringify({ ok: false, error: { code: "uncaught", message: err?.stack || String(err) } }) + "\n"
    );
    process.exit(EXIT.SYSTEM ?? EXIT.BUSINESS);
  }
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { code: "uncaught", message: err?.stack || String(err) } }) + "\n"
  );
  process.exit(EXIT.SYSTEM ?? EXIT.BUSINESS);
});
