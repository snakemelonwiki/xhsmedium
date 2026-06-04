#!/usr/bin/env node
/**
 * playwright-parser: 抓取小红书/抖音帖子指标（点赞/评论/收藏/分享 + 标题）
 * CLI 入口：复用 scripts/parser-core.js 的核心逻辑。
 *
 * 用法：
 *   node scripts/playwright-parser.js <url> [--retry N] [--timeout MS] [--json]
 *
 * 退出码：
 *   0 抓取成功
 *   1 业务错误（登录墙、平台不支持、解析失败）
 *   2 参数错误
 *   3 系统错误（Playwright 缺失、子进程异常）
 *
 * stdout 永远输出一个 JSON 对象；stderr 写进度/重试信息（除非 --json 标志）。
 */

const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { fetchWithRetry } = require(path.join(ROOT, "scripts/parser-core"));

const EXIT = { OK: 0, BUSINESS: 1, USAGE: 2, SYSTEM: 3 };

function parseArgs(argv) {
  const out = { url: undefined, retry: 3, timeout: 20000, silent: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--retry") {
      out.retry = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === "--timeout") {
      out.timeout = Math.max(1000, Number(argv[++i]) || 20000);
    } else if (a === "--json") {
      out.silent = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (!out.url) {
      out.url = a;
    } else {
      throw new Error(`未知参数: ${a}`);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "用法: node scripts/playwright-parser.js <url> [--retry N] [--timeout MS] [--json]",
      "",
      "示例:",
      "  node scripts/playwright-parser.js 'https://www.xiaohongshu.com/explore/abc123'",
      "  node scripts/playwright-parser.js 'https://v.douyin.com/xyz' --retry 5 --timeout 30000",
      "  node scripts/playwright-parser.js '<url>' --json > result.json",
      "",
      "退出码: 0 成功 / 1 业务错误 / 2 参数错误 / 3 系统错误",
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
  if (!args.url) {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: "usage", message: "url 必填" } }) + "\n");
    process.exit(EXIT.USAGE);
  }

  const log = args.silent
    ? () => {}
    : (msg) => process.stderr.write(`[playwright-parser] ${msg}\n`);

  log(`配置: retry=${args.retry} timeout=${args.timeout}ms`);
  const result = await fetchWithRetry(args.url, {
    retry: args.retry,
    timeout: args.timeout,
    log,
  });
  process.stdout.write(JSON.stringify(result) + "\n");

  if (!result.ok) {
    const fatalCodes = new Set(["playwright_missing"]);
    process.exit(fatalCodes.has(result.error.code) ? EXIT.SYSTEM : EXIT.BUSINESS);
  }
  process.exit(EXIT.OK);
}

main().catch((err) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { code: "uncaught", message: err?.stack || String(err) } }) + "\n"
  );
  process.exit(EXIT.SYSTEM);
});
