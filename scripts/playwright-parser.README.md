# playwright-parser

抓取小红书 / 抖音帖子指标（点赞 / 评论 / 收藏 / 分享 + 标题）的统一入口。
基于 Playwright 浏览器自动化 + legacy `metricsFetcher.js`。

## 提供两种形态

### 1. CLI 工具（`scripts/playwright-parser.js`）

本地手动跑 / 接进 PM2 / 接进 cron。

```bash
# 基本用法
node scripts/playwright-parser.js 'https://www.xiaohongshu.com/explore/69f958a0000000003503341b'

# 自定义重试 + 超时 + 仅 JSON 输出
node scripts/playwright-parser.js 'https://v.douyin.com/abc' --retry 5 --timeout 30000 --json > result.json
```

**输出格式**（stdout 永远输出单个 JSON）：
```json
{
  "ok": true,
  "data": {
    "platform": "小红书",
    "title": "作品标题",
    "likes": 1234,
    "comments": 56,
    "favorites": 78,
    "shares": 9,
    "metricsUpdatedAt": "2026-06-04T16:42:00.000Z"
  }
}
```

错误时（带 `--json` 仍走 stdout）：
```json
{
  "ok": false,
  "error": {
    "code": "login_required",
    "retryable": false,
    "message": "当前打开的是小红书登录页...",
    "platform": "小红书"
  }
}
```

**退出码**：

| Code | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 业务错误（登录墙 / 平台不支持 / 解析失败 / 临时错误重试用尽） |
| 2 | 参数错误（缺 url / 未知参数） |
| 3 | 系统错误（Playwright 浏览器二进制缺失） |

**错误码**：

| code | retryable | 说明 |
| --- | --- | --- |
| `platform_unsupported` | false | URL 不属于小红书或抖音 |
| `login_required` | false | 命中登录墙，需先打开登录浏览器完成扫码 |
| `playwright_missing` | false | 浏览器二进制缺失，跑 `npx playwright install chromium-headless-shell` |
| `transient` | true | 网络临时问题（ECONNRESET / ERR_CONNECTION_RESET / 导航超时） |
| `exhausted` | false | 重试用尽 |
| `unknown` | false | 未识别的错误 |

### 2. NestJS HTTP 端点

生产服务调用。

```http
POST /api/parser/parse
Content-Type: application/json

{ "url": "https://www.xiaohongshu.com/explore/...", "retry": 3, "timeout": 20000 }
```

**HTTP 状态码映射**：

| Code | HTTP | 含义 |
| --- | --- | --- |
| `usage` / `platform_unsupported` | 400 | 参数/URL 问题 |
| `login_required` | 401 | 登录墙 |
| `transient` / `exhausted` | 502 | 上游抓取失败（可重试） |
| `playwright_missing` | 500 | 系统级缺失 |
| `unknown` / `uncaught` | 500 | 未识别错误 |
| 成功 | 200 | 返回 `{ ok: true, data: {...} }` |

## 共享核心

`scripts/parser-core.js` 是纯 CommonJS 模块，被 CLI 和 NestJS 共同 require：

```js
const { fetchWithRetry, classifyError, detectPlatform } = require('./parser-core');
const result = await fetchWithRetry(url, { retry: 3, timeout: 20000, log });
```

## 前置条件

- Node.js 18+（Playwright 要求）
- Playwright 浏览器二进制：
  - 默认装在 C 盘 `C:\Users\<user>\AppData\Local\ms-playwright\`
  - 本项目在 Windows 上默认探测 `D:\playwright-browsers`（C 盘满时使用 D 盘）
  - 自定义路径：环境变量 `PLAYWRIGHT_BROWSERS_PATH`
- 登录态 profile：
  - 首次需要先打开登录浏览器（现有 `/api/metrics/open-login-browser` 或 `metricsFetcher.openLoginBrowser(platform)`）

## 已知问题

- 抓取成功率受小红书/抖音风控影响
- 单条抓取 15-30 秒（默认 `waitForTimeout(2000)` + `networkidle`）
- 并发抓取受 Playwright 浏览器实例限制（每实例 1 抓取），多账号并发需要 profile 池

## 与现有 `/posts/parse-link` 端点的关系

`/posts/parse-link`（NestJS）：运营录入作品时点"解析链接"按钮调用，返回基础识别 + 抓取指标 + warning。
`/parser/parse`（NestJS）：通用解析端点，给脚本、批量处理、外部系统用。

两者底层都走 `parser-core.js`。
