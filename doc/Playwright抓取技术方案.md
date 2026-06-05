# Playwright 抓取小红书 / 抖音帖子互动数据 — 技术方案

> 适用版本: `xhsmedium` 前后端重构前源码(v4 与 v3 同源,核心实现一致)
> 核心文件: `metricsFetcher.js` (433 行) + `server.js` 调用点 + `scripts/debug-link.js`
> 依赖: `playwright@1.59.1` (Chromium,持久化 Profile)

---

## 一、目标与边界

### 1.1 业务目标

运营 / 主管 / 销售录作品时,需要把"作品链接 → 标题 / 点赞 / 评论 / 收藏"这一段抓回来,沉淀到 `posts` 表的 `likes / comments / favorites / metricsUpdatedAt` 字段,用于排行榜、看板、客资归因。

### 1.2 支持的平台

| 平台   | URL 关键字           | Profile 目录                         | 备注                   |
|--------|----------------------|--------------------------------------|------------------------|
| 小红书 | `xiaohongshu.com` / `xhslink.com` | `.playwright-profiles/xiaohongshu/` | 短链 `xhslink.com` 也兼容 |
| 抖音   | `douyin.com`         | `.playwright-profiles/douyin/`       |                        |
| 其他   | —                    | —                                    | 抛 "暂时只支持小红书和抖音作品链接" |

### 1.3 不在范围内

- 反爬对抗 / 验证码识别 / 设备指纹伪造
- 自动登录(强依赖人工首次扫码,登录态由 Profile 持久化复用)
- 评论列表、笔记正文、转发数(当前只取三个核心互动数)

---

## 二、总体架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Node.js 进程 (server.js)                         │
│                                                                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │ HTTP 路由层  │───▶│  metricsFetcher  │───▶│  Playwright (chromium)      │   │
│  │ (Express)   │    │                  │    │  + 持久化 Profile 目录       │   │
│  └─────────────┘    └──────────────────┘    └─────────────────────────────┘   │
│         │                     │                          │                   │
│         ▼                     ▼                          ▼                   │
│  authRequired /          fetchMetricsFromUrl       启动新 Context 一次        │
│  requireRole             openLoginBrowser          用完即 close               │
│                                                                              │
│  调用点 7 处:                                                                │
│   L595  POST /api/posts 内部 (创建时)                                          │
│   L1010 POST /api/tools/fetch-metrics (链接测试)                               │
│   L1020 POST /api/tools/open-login-browser                                     │
│   L1796 POST /api/posts/:id/fetch-metrics (单条刷新)                           │
│   L1816 同上 JSON 模式分支                                                     │
│   L1858 POST /api/posts/refresh-metrics (批量刷新,串行)                         │
│   L1892 同上 JSON 模式分支                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          .playwright-profiles/
                          ├── xiaohongshu/   ← Cookies / LocalStorage / 缓存
                          └── douyin/        ← 同上
```

**关键事实**

- 整个爬取链路只有 **一个文件**:`metricsFetcher.js`,对外暴露两个方法。
- Playwright Context 生命周期 = **单次请求**(用完 `await context.close()`),不复用 Browser 实例。
- 登录态靠 **磁盘上的 Profile 目录** 跨进程 / 跨请求复用,而不是靠内存。
- 没有队列、没有重试、没有超时细分,失败直接抛错给前端。

---

## 三、核心模块:`metricsFetcher.js`

### 3.1 平台识别

```js
function detectPlatform(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "小红书";
  if (value.includes("douyin.com")) return "抖音";
  return "";
}
```

`L11-15`,简单字符串包含。**风险点**:抖音分享链是 `v.douyin.com` 短链,目前会被识别为"未支持"。

### 3.2 Profile 目录管理

```js
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
const loginContexts = new Map();   // 进程内的"已打开登录浏览器"缓存

function getProfileDir(platform) {
  return path.join(PROFILE_ROOT, platform === "抖音" ? "douyin" : "xiaohongshu");
}

function clearSingletonLocks(profileDir) {
  // 每次启动前删掉 Chromium 的 SingletonLock / SingletonCookie / SingletonSocket
  // 否则上次崩溃后,新 Context 拿不到独占锁,会启动失败
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
  }
}
```

- 平台 → Profile 一一对应,小红书和抖音是 **两套独立的登录态**,互不污染。
- `clearSingletonLocks` 是 **每次 `launchPersistentContext` 前都跑**,因为 `openLoginBrowser` 用的是常驻 Context(`headless: false`),如果用户用 `openLoginBrowser` 开了一个窗口还没关,后台又跑了一次 `fetchMetricsFromUrl`,就会出现"Profile 已被占用"的错误,删锁是兜底。

### 3.3 数量解析:中英文 + 万 / 千

```js
function parseCount(raw) {
  const value = String(raw || "").trim().toLowerCase().replace(/,/g, "");
  const match = value.match(/(\d+(?:\.\d+)?)(\s*[wk万千k]?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].trim();
  if (unit === "w" || unit === "万") return Math.round(amount * 10000);
  if (unit === "k" || unit === "千") return Math.round(amount * 1000);
  return Math.round(amount);
}
```

支持 `1.2w / 3千 / 5K / 10000` 四种写法。这是后续所有层(Layer 2 / 3 / 4)的统一入口。

### 3.4 两阶段 Context 启动

```js
// 阶段 A:打开登录浏览器(常驻,有头)
async function openLoginBrowser(platform) {
  if (loginContexts.has(platform)) {
    // 复用已经打开的窗口,只是重新导航到首页
    const context = loginContexts.get(platform);
    const existing = context.pages()[0] || (await context.newPage());
    await existing.bringToFront();
    await existing.goto(getPlatformHome(platform), ...);
    return { ok: true, platform };
  }
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,                // ★ 必须有头,扫码用
    viewport: { width: 1440, height: 980 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
  });
  context.on("close", () => loginContexts.delete(platform));
  loginContexts.set(platform, context);
  ...
}

// 阶段 B:抓取指标(短暂,无头)
async function launchProfileContext(platform) {
  return chromium.launchPersistentContext(profileDir, {
    headless: true,                 // ★ 无头
    viewport: { width: 1440, height: 1100 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
  });
}
```

- 两个 Context 共享同一个 Profile 目录,**所以登录态可以跨模式复用**。
- 但因为 `chromium.launchPersistentContext` 同一时刻只允许一个进程独占目录,所以 `openLoginBrowser` 打开的常驻窗口会 **锁住目录**,后台的 `fetchMetricsFromUrl` 启动时会冲突(被 `clearSingletonLocks` 强行解锁,可能导致登录窗口异常关闭)。
- User-Agent 写死 Chrome 124,不能改 — 一改可能触发平台风控。

### 3.5 多层解析策略(核心)

**小红书 (`scrapeXiaohongshu`)** 有 4 层 fallback,按优先级合并:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: window.__INITIAL_STATE__ (服务端注入的 React 初始数据)               │
│   读 window.__INITIAL_STATE__.note.noteDetailMap[*]                          │
│   取 interact_info.liked_count / comment_count / collected_count             │
│   同时拿到 title                                                             │
│   ↓ 失败                                                                      │
│ Layer 2: 互动栏 DOM (.interactions.engage-bar .interact-container)            │
│   .like-wrapper .count / .chat-wrapper .count / .collect-wrapper .count       │
│   ↓ 失败                                                                      │
│ Layer 3: 页面 HTML 正则匹配                                                   │
│   /"likedCount"\s*:\s*(\d+)/ 等 12 个正则                                      │
│   ↓ 失败                                                                      │
│ Layer 4: body.innerText 关键字提取                                            │
│   "点赞 N / 评论 N / 收藏 N" + 评论区"说点什么... N N N 发送" + 底部"登录后评论"  │
│   (三种位置,以评论输入框右侧的数字最准)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**抖音 (`scrapeDouyin`)** 只有 3 层,没有 `__INITIAL_STATE__` 那条路:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: 互动栏 DOM (data-e2e / class*='like' / aria-label*='点赞')           │
│ Layer 2: 页面 HTML 正则 (diggCount / commentCount / collectCount 等)          │
│ Layer 3: body.innerText 关键字提取(同小红书)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**合并规则**(以小红书为例):

```js
const likes = parseCount(initialState?.likes)            // L1
           ?? parseCount(precise?.likes)                  // L2
           ?? await readCountBySelectors(page, [...])     // L1+L2 DOM 兜底
           ?? htmlFallback.likes                          // L3
           ?? fallback.likes                              // L4
           ?? 0;
```

- `parseCount` 返回 `null` 时,`??` 才会走下一层,意味着 **只要 Layer 1 解析得到数字就不再问 DOM**。
- 抖音的 `readCountBySelectors` 一次返回多选择子串,每个选择子有 1.2s 短超时,首条可见即用。

### 3.6 登录墙检测

```js
function looksLikeLoginWall(platform, bodyText, pageTitle) {
  if (platform === "小红书") {
    const hasPostSignals =
      /共\s*[\d.,wkW万千]+\s*条评论/.test(text)
      || /登录后评论\s*[\d.,wkW万千]+\s*.../.test(text)
      || /说点什么\.\.\.\s*[\d.,wkW万千]+\s*.../.test(text)
      || /点赞/.test(text) || /评论/.test(text) || /收藏/.test(text)
      || /\d{2}-\d{2}/.test(text);             // 笔记发布日期
    const genericTitle = title === "小红书 - 你的生活兴趣社区" || ...
    return !hasPostSignals && (                // ★ 页面没有任何"帖子信号"
      text.includes("登录后推荐更懂你的笔记") ||
      text.includes("手机号登录") || ...
    );
  }
  return text.includes("登录后") || text.includes("扫码登录") || text.includes("验证码登录");
}
```

- 判定逻辑: **页面里完全没有"笔记"的痕迹** + **页面里有登录关键词** → 判定为登录墙。
- 命中后:`throw new Error("当前打开的是小红书登录页,请先在"链接测试"里点"打开小红书登录浏览器"完成一次登录。")`
- 这条错误信息会原样返回给前端,前端看到后应当提示用户去触发 `openLoginBrowser`。

### 3.7 主流程 `fetchMetricsFromUrl`

```js
async function fetchMetricsFromUrl(url) {
  const platform = detectPlatform(url);                 // ① 识别
  if (!platform) throw new Error("暂时只支持小红书和抖音作品链接");

  const context = await launchProfileContext(platform); // ② 启无头 Context
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);                    // ★ 额外等 2s,等水合完成

    const pageTitle = await page.title().catch(() => "");
    const payload = platform === "小红书" ? await scrapeXiaohongshu(page) : await scrapeDouyin(page);

    if (looksLikeLoginWall(platform, payload.bodyText, pageTitle)) {
      throw new Error("当前打开的是${platform}登录页,请先调用 openLoginBrowser");
    }

    const normalizedTitle = String(payload.title || pageTitle || "")
      .replace(/\s*-\s*小红书\s*$/, "")
      .replace(/\s*-\s*抖音\s*$/, "")
      .trim();

    return {
      platform, title: normalizedTitle,
      likes: Number(payload.likes || 0),
      comments: Number(payload.comments || 0),
      favorites: Number(payload.favorites || 0),
      metricsUpdatedAt: new Date().toISOString()
    };
  } finally {
    await context.close();                              // ③ 用完即关
  }
}
```

**关键超时**:`DEFAULT_TIMEOUT = 15000`(15s) — `goto` 用这个,`waitForLoadState("networkidle")` 单独 5s,`waitForTimeout(2000)` 是写死等。

---

## 四、HTTP 端点(server.js)

| 方法 + 路径                                       | 角色限制              | 作用                                                                  |
|---------------------------------------------------|-----------------------|-----------------------------------------------------------------------|
| `POST /api/tools/fetch-metrics`                   | 任意已登录            | "链接测试"入口,纯抓取,不入库                                         |
| `POST /api/tools/open-login-browser`              | 任意已登录            | 启动一个有头窗口,让用户扫码登录                                       |
| `GET  /api/tools/open-login-browser`              | 任意已登录            | 同上,支持 GET 是为了前端"按钮"直连方便                                |
| `POST /api/posts/:id/fetch-metrics`               | staff 限本人 / 其他不限 | "单条刷新",入库 `posts.likes / comments / favorites / metricsUpdatedAt` |
| `POST /api/posts/refresh-metrics`                 | admin / owner         | "批量刷新",接收 `postIds[]`,**串行**逐条抓取,返回 `{total, refreshed, skipped, failed}` |

### 4.1 串行批量刷新(L1836-1918)

```js
for (const post of targets) {
  if (!post.postUrl) { skipped += 1; continue; }
  try {
    const metrics = await fetchMetricsFromUrl(post.postUrl);  // ★ 一条完成才走下一条
    await repositories.updatePostMetrics(post.id, metrics);
    refreshed += 1;
  } catch (error) {
    failed.push({ id: post.id, title: post.title, message: error.message });
  }
}
await persistDailySnapshotsFromRepositories();
```

- **串行** 是有意的:并发会触发平台风控(多窗口/IP 短时间大量访问)。
- 失败不中断,失败的塞到 `failed[]` 返回。
- MySQL 模式下走 `repositories.updatePostMetrics`;JSON 模式下走 `db.posts.map(...)` 直接覆盖。
- 收尾的 `persistDailySnapshotsFromRepositories` 写 `daily-snapshots.json`,支撑后续"指标回滚"功能。

### 4.2 仓储层更新

`repositories.updatePostMetrics`:

```sql
UPDATE posts
   SET likes = ?, comments = ?, favorites = ?, metrics_updated_at = ?
 WHERE id = ?
```

只覆盖 4 个字段,不修改 `title` / `publishedAt` / `postUrl`,所以"刷新数据"不会丢人工填的内容。

---

## 五、前端集成

### 5.1 当前情况

**`public/app.js` 当前没有直接调用 `/api/tools/*` 端点**。验证方式:`grep -nE "tools|playwright|fetch-metrics|open-login-browser" public/app.js` 无业务命中。

前端只调:

| 端点                                          | 用途                                       |
|-----------------------------------------------|--------------------------------------------|
| `POST /api/posts` / `PUT /api/posts/:id`     | 录入 / 编辑作品,**不自动抓取**,只把人工填的 0 存进去 |
| `POST /api/dashboard/refresh-entered-data`   | "同步看板",只重算快照,不抓外部数据          |
| `POST /api/posts/rollback-metrics`           | 从快照回退,不抓外部数据                     |
| `POST /api/posts/refresh-metrics`            | 批量刷新(已存在端点,**前端目前没看到入口**) |

后端抓取端点(`/api/posts/:id/fetch-metrics` / `/api/tools/*`)在当前前端里没有 UI 入口,看上去是"后端先行,前端待补"或"UI 在某个版本被回滚过"的状态。

### 5.2 之前版本的差异

`versions/pre-v4-rollback-20260502-rollback/app.js` 注释里写:

> 填写作品链接后,系统会尝试自动抓取标题、点赞、评论、收藏。

但当前 `app.js` 已经没有了那段逻辑,只保留 `result.metricsSyncError` 的展示分支(可能始终为 `""`)。

### 5.3 调试入口

`scripts/debug-link.js` 是个 CLI 工具,**不走 HTTP**,用同一份 `metricsFetcher.detectPlatform` 走同样的流程,最终输出到 `debug-output/`:

```bash
node scripts/debug-link.js https://www.xiaohongshu.com/discovery/item/xxx
node scripts/debug-link.js https://www.xiaohongshu.com/discovery/item/xxx --headed
```

产物:
- `debug-output/小红书-2026-04-10T08-14-23-534Z.png` — 全页截图
- `debug-output/小红书-2026-04-10T08-14-23-534Z.txt` — 标题 / finalUrl / 前 3000 字 body

排查"抓不到 / 抓错"时的标准动作。

---

## 六、运维与可观测性

### 6.1 目录约定

```
.playwright-profiles/
├── xiaohongshu/
│   ├── Cookies / Cookies-journal
│   ├── Local Storage/leveldb/
│   ├── Network Persistent State
│   ├── Local State
│   └── ... (Chromium user-data-dir 全量)
└── douyin/   (同上)
```

- **必须** 在 `deploy/package-code-only.sh` 排除列表里(目前 `uploads/ backups/ data.json` 被排除,但 `.playwright-profiles/` **没被显式排除**,部署到云服务器时,可能连登录态一起上传,生产环境是隐患)。
- 推荐加进 `.gitignore`(项目根的 `.gitignore` 已含 `.playwright-profiles/xiaohongshu` 等若干路径,但需确认覆盖到所有平台目录)。

### 6.2 进程内缓存

`const loginContexts = new Map();` 只缓存"已打开的登录浏览器"(`openLoginBrowser` 的常驻 Context),与抓取路径无关。重启进程后,缓存清空,但 Profile 仍在磁盘。

### 6.3 失败模式与告警

当前实现 **没有** 任何形式的:
- 失败告警(失败只塞 `failed[]` 数组,前端 alert,无人值守时无人感知)
- 抓取耗时统计 / 成功率看板
- 平台反爬迹象记录(验证码、滑块、IP 限流)
- 重试 / 退避(失败就失败,人工重新点)

### 6.4 并发 / 限流

- 单次抓取平均 6-8s(2s 等待 + 加载 + 解析)。
- 没有全局锁,理论上多个请求并发会同时启动多个 Chromium,资源消耗大且容易被风控。
- 批量刷新是 **串行**,实测 50 条 ≈ 5-7 分钟,期间请求 / 端口会一直挂着。

---

## 七、已知问题与风险

| # | 问题                                                                 | 影响                          | 当前应对 |
|---|----------------------------------------------------------------------|-------------------------------|----------|
| 1 | 抖音短链 `v.douyin.com` 不被 `detectPlatform` 识别                  | 前端传短链 → 报"暂时只支持"  | 无       |
| 2 | `openLoginBrowser` 常驻窗口锁住 Profile,后台抓取触发 `clearSingletonLocks` 强解 | 登录窗口被意外关闭            | 强删锁    |
| 3 | 平台改版后,DOM 类名 / `__INITIAL_STATE__` 路径变化 → 全部抓空         | 静默返回 0 / null             | L4 文本兜底 |
| 4 | 没有重试、没有超时细分,网络抖动直接失败                              | 用户体验差                    | 无       |
| 5 | User-Agent 写死 Chrome 124,长期会过期                                 | 风控概率上升                  | 手动维护  |
| 6 | 批量刷新是同步串行,大量作品时阻塞请求                                | 主管端"批量刷新"按钮卡死     | 无       |
| 7 | Profile 目录无加密,云服务器部署时登录态明文落盘                      | 账号安全风险                  | 无       |
| 8 | `metricsFetcher.js` 是 CommonJS,无单元测试                            | 重构风险                      | 无       |
| 9 | `/api/tools/*` 端点无 UI 入口                                          | 功能不闭环,用户不知道有这功能 | 待补前端 |

---

## 八、改造建议(向后兼容,不破坏现有 Profile)

### 8.1 短期(必须做)

1. **补齐前端 UI** — 在"链接测试"卡片里加两个按钮,调 `/api/tools/fetch-metrics` 和 `/api/tools/open-login-browser`,把抓取结果回填到表单。
2. **抖音短链支持** — `detectPlatform` 加 `v.douyin.com`,并在抓取前 `page.goto` 让它 302 到真实长链。
3. **云部署排除 Profile** — 在 `deploy/package-code-only.sh` 排除 `.playwright-profiles/`,避免线上误用本地登录态。
4. **失败埋点** — `fetchMetricsFromUrl` 失败时 `console.warn({ platform, url, error })`,方便查 `pm2 logs`。

### 8.2 中期(质量)

5. **超时分级** — `goto` 15s 改 10s,DOM 等待 1.2s 改 800ms,总预算 < 12s。
6. **限流器** — 进程内维护 `p-limit` 风格的"同时只能 1 个抓取"队列,批量刷新 API 也走同一个池,避免管理员一边手动刷、一边自动批量刷相互打架。
7. **抓取缓存** — 同一 `postUrl` 在 5 分钟内命中 `Map<url, {expires, metrics}>`,减少重复请求。
8. **解析层健康检查** — 解析返回 0 时,加一个 metric 上报,便于平台改版时第一时间告警。

### 8.3 长期(架构)

9. **拆出独立 Worker** — 把 `metricsFetcher.js` 抽到独立进程,主进程通过 Redis/Bull 队列下发任务,失败自动重试 3 次,Worker 可水平扩展。
10. **官方 API 替换** — 与平台官方数据接口(如有)或第三方数据服务对接,Playwright 作为兜底。
11. **快照先于抓取** — 抓取前先写 `pending_metrics=true`,抓完再覆盖,断网 / 崩溃不会留下半截数据。
12. **Profile 加密** — 部署到云时,Profile 用 `aes-256-gcm` 加密后存对象存储,启动时解密到临时目录,关闭时清空。

---

## 九、附录:完整调用链

### A. 单条刷新(`/api/posts/:id/fetch-metrics`)

```
[admin/owner/staff] 点"刷新数据"
  → POST /api/posts/:id/fetch-metrics
  → authRequired 校验 token
  → MySQL: repositories.findPostById
  → staff 校验 owner
  → fetchMetricsFromUrl(postUrl)
       → detectPlatform
       → launchProfileContext(xiaohongshu | douyin)         // headless: true
            → clearSingletonLocks
            → chromium.launchPersistentContext(.playwright-profiles/<platform>)
       → page.goto + waitForLoadState + waitForTimeout(2000)
       → scrapeXiaohongshu / scrapeDouyin                   // 4 层 / 3 层 fallback
       → looksLikeLoginWall                                 // 登录墙检测
       → context.close()
  → repositories.updatePostMetrics                          // UPDATE posts SET 4 fields
  → persistDailySnapshotsFromRepositories                   // 写 daily-snapshots.json
  → 200 { ok: true, metrics }
```

### B. 批量刷新(`/api/posts/refresh-metrics`)

```
[admin/owner] 选多条 → POST /api/posts/refresh-metrics { postIds: [...] }
  → requireRole("admin", "owner")
  → repositories.listPosts / db.posts
  → for (const post of targets) {                          // 串行
       try {
         fetchMetricsFromUrl(post.postUrl)
         repositories.updatePostMetrics / db.posts.map
         refreshed += 1
       } catch (e) { failed.push(...) }
    }
  → persistDailySnapshotsFromRepositories
  → 200 { ok, total, refreshed, skipped, failed }
```

### C. 登录浏览器(`/api/tools/open-login-browser`)

```
[任意已登录] 调 POST /api/tools/open-login-browser { platform: "小红书" | "抖音" }
  → if (loginContexts.has(platform)) reuse + bringToFront + goto(home)
  → else
       → clearSingletonLocks
       → chromium.launchPersistentContext(profileDir, { headless: false, viewport 1440x980 })
       → context.on("close", () => loginContexts.delete(platform))
       → loginContexts.set(platform, context)
       → page.goto(home)
  → 用户在可见窗口里手动扫码 / 短信登录
  → 登录态写回 .playwright-profiles/<platform>/
  → 此后所有 headless 抓取自动复用
```

### D. 调试脚本(`scripts/debug-link.js`)

```
$ node scripts/debug-link.js <url> [--headed]
  → detectPlatform
  → clearSingletonLocks
  → chromium.launchPersistentContext(.playwright-profiles/<platform>, { headless: !headed })
  → page.goto(url) + waitForLoadState + waitForTimeout(2500)
  → page.screenshot({ fullPage: true }) → debug-output/<platform>-<ts>.png
  → fs.writeFileSync(debug-output/<platform>-<ts>.txt,  { platform, input_url, final_url, title, body_snippet(3000字) })
  → context.close()
```

---

## 十、文件索引

| 文件                                                  | 行数   | 角色                       |
|-------------------------------------------------------|--------|----------------------------|
| `metricsFetcher.js`                                   | 433    | **唯一**爬取模块           |
| `server.js:8`                                         | 1      | `require("./metricsFetcher")` |
| `server.js:1003-1015`                                 | 12     | `/api/tools/fetch-metrics` |
| `server.js:1017-1028`                                 | 11     | `/api/tools/open-login-browser` |
| `server.js:1784-1834`                                 | 50     | `/api/posts/:id/fetch-metrics` |
| `server.js:1836-1918`                                 | 82     | `/api/posts/refresh-metrics` (含批量串行) |
| `repositories.js:211-216`                             | 5      | `updatePostMetrics` SQL    |
| `scripts/debug-link.js`                               | 86     | CLI 调试 + 截图落盘         |
| `.playwright-profiles/xiaohongshu/`                   | —      | 持久化登录态(小红书)       |
| `.playwright-profiles/douyin/`                        | —      | 持久化登录态(抖音)         |
| `debug-output/`                                       | —      | 调试截图 / 文本产物         |

> 注:本仓库 `public/app.js` 当前 **未** 直接调用 `/api/tools/*`,UI 入口待补;`/api/posts/:id/fetch-metrics` 和 `/api/posts/refresh-metrics` 后端可用,前端缺按钮。
