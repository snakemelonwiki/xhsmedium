const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Linux 无桌面环境：自动启动 Xvfb 虚拟帧缓冲 ────────────────
// 抖音抓取使用 headless: false（有头模式）绕过反爬检测。
// Ubuntu Server / Docker 等无 GUI 环境没有 Display Server，
// Chromium 无法创建窗口 → 直接崩溃。这里自动检测并启动 Xvfb。
let xvfbProcess = null;
if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  const XVFB_DISPLAY = ":99";
  try {
    // 检查 Xvfb 是否已安装
    execSync("which Xvfb", { stdio: "ignore" });
    // 启动虚拟帧缓冲（-screen 0 1920x1080x24 提供 1080p 虚拟屏幕）
    xvfbProcess = spawn("Xvfb", [XVFB_DISPLAY, "-screen", "0", "1920x1080x24", "-ac", "-nolisten", "tcp"], {
      stdio: "ignore",
      detached: true,
    });
    xvfbProcess.unref();
    process.env.DISPLAY = XVFB_DISPLAY;
    console.log(`[metricsFetcher] 已启动 Xvfb (${XVFB_DISPLAY})，有头模式将在虚拟屏幕上运行`);
    // 进程退出时关闭 Xvfb
    const killXvfb = () => {
      if (xvfbProcess && !xvfbProcess.killed) {
        try { xvfbProcess.kill("SIGTERM"); } catch {}
      }
    };
    process.on("exit", killXvfb);
    process.on("SIGINT", () => { killXvfb(); process.exit(0); });
    process.on("SIGTERM", () => { killXvfb(); process.exit(0); });
  } catch {
    console.warn("[metricsFetcher] Xvfb 未安装，抖音有头模式可能失败。安装: sudo apt install xvfb");
  }
}

// Playwright 浏览器二进制路径：优先用环境变量（兼容用户自定义位置），
// 否则尝试默认位置。Windows 上 C 盘满时把默认指向 D 盘避免 ENOSPC。
// 关键：这段必须在 require("playwright") 之前执行 —— Playwright 在 require 时
// 会按当时的 PLAYWRIGHT_BROWSERS_PATH 锁定 executablePath，事后改 env 不再生效。
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  if (process.platform === "win32") {
    const dDrive = "D:\\playwright-browsers";
    if (fs.existsSync(dDrive)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = dDrive;
    }
  }
}

const { chromium } = require("playwright");
const sharp = require("sharp");

const DEFAULT_TIMEOUT = 15000;
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
const COVERS_DIR = path.join(__dirname, "uploads", "post-covers");
const COVER_THUMB_MAX_WIDTH = 960;
const COVER_THUMB_QUALITY = 92;
const loginContexts = new Map();

// ── 优化：资源拦截 ──────────────────────────────────────────────
// 屏蔽字体/CSS/媒体/WebSocket，只放行 document/script/xhr/fetch/image。
// SSR 数据（__INITIAL_STATE__ / RENDER_DATA）在 HTML 原文里，不需要渲染完整页面。
// 注意：image 不能屏蔽——capturePostCover 走视口截图兜底时需要 <img> 已加载，
// 否则封面会是空白图（语义封面失败时）。
const BLOCKED_RESOURCE_TYPES = new Set(["stylesheet", "font", "media", "websocket"]);

// ── 优化：浏览器上下文池 ────────────────────────────────────────
// 复用 persistent context，避免每次请求冷启动 Chromium（省 1-3s）。
// 全局锁保证同一时刻只有一个抓取任务，所以单 context 够用。
const pooledContexts = new Map(); // platform -> BrowserContext

// ── 并发锁：同一平台串行化抓取，避免多个请求共用 persistent context 时
//     同时启动浏览器导致 profile 目录锁冲突（Chromium 一个 profile 只能被一个实例独占）
const platformLocks = new Map(); // platform -> Promise<void>
const lockAcquires = new Map();  // platform -> Promise<void>

async function withPlatformLock(platform, fn) {
  // 1. 等待所有正在获取该锁的请求完成
  while (lockAcquires.has(platform)) {
    try { await lockAcquires.get(platform); } catch {}
  }

  // 2. 标记自己正在获取锁
  let resolveAcquire;
  const acquirePromise = new Promise((resolve) => { resolveAcquire = resolve; });
  lockAcquires.set(platform, acquirePromise);

  try {
    // 3. 再次检查是否有当前锁（等待期间可能被其他请求设置了）
    while (platformLocks.has(platform)) {
      try { await platformLocks.get(platform); } catch {}
    }

    // 4. 获取锁
    let release;
    const lock = new Promise((resolve) => { release = resolve; });
    platformLocks.set(platform, lock);

    try {
      return await fn();
    } finally {
      platformLocks.delete(platform);
      release();
    }
  } finally {
    lockAcquires.delete(platform);
    resolveAcquire();
  }
}

async function getContext(platform) {
  const existing = pooledContexts.get(platform);
  if (existing) {
    try {
      existing.pages();
      console.log(`[metricsFetcher] 复用 ${platform} 浏览器上下文（池命中）`);
      return existing;
    } catch {
      console.warn(`[metricsFetcher] ${platform} 上下文已失效，重新创建`);
      pooledContexts.delete(platform);
    }
  }
  const profileDir = getProfileDir(platform);

  // 抖音对 GPU/渲染较敏感，Windows 也常因驱动/虚拟桌面崩溃，统一加 --disable-gpu；
  // Linux 还加 --no-sandbox / --disable-dev-shm-usage。
  const isHeadless = platform !== "抖音";
  const baseArgs = [];
  if (platform === "抖音") {
    baseArgs.push("--disable-gpu");
  }
  if (process.platform === "linux") {
    baseArgs.push("--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // 每次启动前清理单例锁文件，防止上一次崩溃残留锁
      clearSingletonLocks(profileDir);
      if (attempt > 0) {
        console.warn(`[metricsFetcher] ${platform} 浏览器启动失败，额外清理 journal 后重试`);
        // 更激进地清理可能导致锁定的文件
        for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket", "Default/Cookies-journal", "Default/Network/Cookies-journal"]) {
          try { fs.rmSync(path.join(profileDir, name), { force: true, recursive: true }); } catch {}
        }
      }
      console.log(`[metricsFetcher] 创建 ${platform} 浏览器上下文（冷启动，attempt=${attempt + 1}）`);
      const attemptArgs = [...baseArgs];
      if (attempt > 0 && platform === "抖音" && process.platform === "win32") {
        // 二次尝试：Windows 下抖音偶发 GPU/沙箱崩溃，追加 --no-sandbox 兜底
        attemptArgs.push("--no-sandbox");
      }
      const ctx = await chromium.launchPersistentContext(profileDir, {
        headless: isHeadless,
        viewport: { width: 1440, height: 1100 },
        args: [
          ...(isHeadless ? ["--disable-remote-fonts"] : []),
          ...attemptArgs,
        ],
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
      pooledContexts.set(platform, ctx);
      return ctx;
    } catch (err) {
      console.warn(`[metricsFetcher] ${platform} 浏览器上下文启动失败 (attempt=${attempt + 1}): ${err?.message || err}`);
      if (attempt === 1) throw err;
    }
  }
  throw new Error(`${platform} 浏览器上下文启动失败`);
}

function releaseContext(platform) {
  const ctx = pooledContexts.get(platform);
  if (ctx) {
    ctx.close().catch(() => {});
    pooledContexts.delete(platform);
  }
}

function cleanupAllContexts() {
  for (const [platform, ctx] of pooledContexts) {
    ctx.close().catch(() => {});
    pooledContexts.delete(platform);
  }
}

// 进程退出时清理
process.on("exit", cleanupAllContexts);
process.on("SIGINT", () => { cleanupAllContexts(); process.exit(0); });
process.on("SIGTERM", () => { cleanupAllContexts(); process.exit(0); });

fs.mkdirSync(PROFILE_ROOT, { recursive: true });
fs.mkdirSync(COVERS_DIR, { recursive: true });

function detectPlatform(url) {
  const value = String(url || "").toLowerCase();
  // 小红书:长链 + 短链
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "小红书";
  // 抖音:长链(douyin.com / iesdouyin.com 老短链 / v.douyin.com 新短链)
  // 短链在抓取时会被 302 到长链,这里只做平台识别,真实 URL 在 page.goto 时由浏览器解析
  if (value.includes("douyin.com") || value.includes("iesdouyin.com") || value.includes("v.douyin.com")) return "抖音";
  return "";
}

function normalizeUrl(url) {
  return String(url || "").trim();
}

// ── Tier 1：登录墙错误类型（区别于普通网络错误，外层重试时跳过） ─────
class LoginWallError extends Error {
  constructor(message) {
    super(message);
    this.name = "LoginWallError";
  }
}

// ── Tier 1：结果缓存（LRU + 5 分钟 TTL） ────────────────────────
// 同一作品 5 分钟内重复请求直接返回上次结果，省去浏览器加载。
// key 优先用 platform + 作品 ID（短链/参数变化时仍能命中）。
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const RESULT_CACHE_MAX = 200;
const resultCache = new Map();

function canonicalCacheKey(platform, url) {
  if (platform === "小红书") {
    const id = extractXiaohongshuNoteId(url);
    if (id) return `xhs:${id}`;
  }
  if (platform === "抖音") {
    const id = extractDouyinVideoId(url);
    if (id) return `douyin:${id}`;
  }
  return `${platform}:${url}`;
}

function getCachedResult(key) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    resultCache.delete(key);
    return null;
  }
  // LRU：访问后挪到队尾
  resultCache.delete(key);
  resultCache.set(key, entry);
  return entry.value;
}

function setCachedResult(key, value) {
  if (resultCache.size >= RESULT_CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, { value, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
}

// ── Tier 1：短链 HEAD 预展开（避免浏览器加载短链浪费一次完整渲染） ──
// v.douyin.com / xhslink.com 走 HEAD 请求拿 Location，最多跟 5 跳重定向。
const SHORT_LINK_HOST_RE = /(^|\.)(v\.douyin\.com|xhslink\.com)$/i;

async function expandShortUrl(url, maxHops = 5) {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    let parsed;
    try {
      parsed = new URL(current);
    } catch {
      return current;
    }
    if (!SHORT_LINK_HOST_RE.test(parsed.hostname)) return current;
    const next = await new Promise((resolve) => {
      const lib = parsed.protocol === "https:" ? require("https") : require("http");
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + (parsed.search || ""),
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            Accept: "*/*",
          },
          timeout: 5000,
        },
        (res) => {
          const loc = res.headers.location;
          res.resume();
          if (!loc) {
            resolve(null);
            return;
          }
          try {
            resolve(new URL(loc, current).toString());
          } catch {
            resolve(null);
          }
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try { req.destroy(); } catch {}
        resolve(null);
      });
      req.end();
    });
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

function getProfileDir(platform) {
  return path.join(PROFILE_ROOT, platform === "抖音" ? "douyin" : "xiaohongshu");
}

function getPlatformHome(platform) {
  return platform === "抖音" ? "https://www.douyin.com/" : "https://www.xiaohongshu.com/";
}

function clearSingletonLocks(profileDir) {
  for (const name of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    const file = path.join(profileDir, name);
    try {
      fs.rmSync(file, { force: true, recursive: true });
    } catch {}
  }
}

function parseCount(raw) {
  const value = String(raw || "").trim().toLowerCase().replace(/,/g, "");
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)(\s*[wk万千k]?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].trim();
  if (Number.isNaN(amount)) return null;
  if (unit === "w" || unit === "万") return Math.round(amount * 10000);
  if (unit === "k" || unit === "千") return Math.round(amount * 1000);
  return Math.round(amount);
}

/**
 * 多 selector 并行尝试，第一个返回非空文本的胜出。
 * 旧版对 N 个 selector 串行调用：worst case N×1.2s（douyin 4 项指标 × 6 selectors × 1.2s = 28.8s，
 * 是抓取耗时的主要瓶颈）。现在所有 selector 并行 + 整体 perSelectorTimeout 硬上限。
 */
async function readTextBySelectors(page, selectors, perSelectorTimeout = 1500) {
  if (!selectors || !selectors.length) return "";

  const overallTimeoutMs = perSelectorTimeout + 200;
  const attempt = (selector) => (async () => {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: perSelectorTimeout });
      const text = (await locator.textContent()) || "";
      return text.trim();
    } catch {
      return "";
    }
  })();

  // 跑两个 Promise：所有 selector 一起跑（任一拿到非空就 settle）+ 整体超时兜底
  return new Promise((resolve) => {
    let settled = false;
    const settle = (val) => {
      if (settled) return;
      settled = true;
      resolve(val || "");
    };
    // 全部跑完，哪个先出非空用哪个；全空时由 Promise.all 兜底
    Promise.all(selectors.map((sel) => attempt(sel))).then((texts) => {
      // 优先取第一个非空（保留原顺序语义，便于回归）
      for (const t of texts) {
        if (t) { settle(t); return; }
      }
      settle("");
    });
    setTimeout(() => settle(""), overallTimeoutMs);
  });
}

async function readCountBySelectors(page, selectors) {
  const direct = await readTextBySelectors(page, selectors);
  const parsed = parseCount(direct);
  if (parsed !== null) return parsed;
  return null;
}

function extractDouyinVideoId(url) {
  // modal_id=xxx 或 /video/xxx 或 /note/xxx
  const modalMatch = url.match(/[?&]modal_id=(\d+)/);
  if (modalMatch) return modalMatch[1];
  const pathMatch = url.match(/\/(?:video|note)\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}

function extractDouyinFromDetail(detail) {
  if (!detail || typeof detail !== "object") return null;
  try {
    // 抖音数据来源有两种结构：
    // 1. API /aweme/v1/web/aweme/detail/ 返回：detail.statistics（snake_case）+ detail.author
    // 2. RSC flight data（图文/笔记页 awemeType=68）：detail.stats（camelCase）+ detail.authorInfo
    const apiStats = detail.statistics || {};
    const rscStats = detail.stats || {};
    const stats = {
      digg_count: apiStats.digg_count ?? rscStats.diggCount,
      comment_count: apiStats.comment_count ?? rscStats.commentCount,
      collect_count: apiStats.collect_count ?? rscStats.collectCount,
      share_count: apiStats.share_count ?? rscStats.shareCount,
    };

    const author = detail.author || detail.authorInfo || {};
    const video = detail.video || {};

    // 封面：视频页取 video.cover；图文/笔记页（awemeType 68）取 images[0]
    const pickCover = (o) =>
      Array.isArray(o?.url_list)
        ? o.url_list.find((u) => typeof u === "string" && /^https?:\/\//.test(u) && !isPlaceholderCoverUrl(u))
        : "";
    const pickCoverCamel = (o) =>
      Array.isArray(o?.urlList)
        ? o.urlList.find((u) => typeof u === "string" && /^https?:\/\//.test(u) && !isPlaceholderCoverUrl(u))
        : "";
    const pickStringCover = (url) => (typeof url === "string" && /^https?:\/\//.test(url) && !isPlaceholderCoverUrl(url) ? url : "");
    const noteCover = Array.isArray(detail.images) && detail.images.length > 0
      ? pickCoverCamel(detail.images[0]) || pickCover(detail.images[0])
      : "";
    const coverImageUrl =
      noteCover ||
      pickCover(video.cover) ||
      pickCoverCamel(video.cover) ||
      pickStringCover(video.cover) ||
      pickStringCover(video.coverUrl) ||
      pickCover(video.dynamic_cover) ||
      pickCoverCamel(video.dynamicCover) ||
      pickCover(video.origin_cover) ||
      pickCoverCamel(video.originCover) ||
      pickStringCover(video.originCover) ||
      pickStringCover(video.dynamicCover) ||
      "";

    let publishDate = "";
    const ts = detail.create_time ?? detail.createTime;
    if (ts) {
      const timestamp = Number(ts);
      const d = new Date(timestamp * 1000);
      const dateSource = detail.create_time != null ? "create_time" : "createTime";
      if (Number.isFinite(timestamp) && Number.isFinite(d.getTime())) {
        publishDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        console.log(`[metricsFetcher] 抖音发布日期元素抓取: source=${dateSource}, raw=${String(ts)}, parsed=${publishDate}`);
      } else {
        console.warn(`[metricsFetcher] 抖音发布日期元素已抓取但未识别: source=${dateSource}, raw=${String(ts)}`);
      }
    } else {
      console.warn("[metricsFetcher] 抖音发布日期元素未找到: source=detail.create_time/detail.createTime");
    }

    return {
      title: String(detail.desc || "").trim(),
      authorName: String(author.nickname || "").trim(),
      authorId: String(author.uid || author.short_id || author.user_id || "").trim(),
      authorUrl: author.sec_uid || author.secUid ? `https://www.douyin.com/user/${author.sec_uid || author.secUid}` : "",
      publishDate,
      likes: Number(stats.digg_count ?? 0),
      comments: Number(stats.comment_count ?? 0),
      favorites: Number(stats.collect_count ?? 0),
      shares: Number(stats.share_count ?? 0),
      coverImageUrl,
    };
  } catch (err) {
    console.warn(`[metricsFetcher] extractDouyinFromDetail failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * 判断抖音封面 URL 是否是占位图/纯色图。
 * 抖音常用 `~noop.jpeg` 作为无意义占位封面，需要跳过。
 */
function isPlaceholderCoverUrl(url) {
  if (!url || typeof url !== "string") return true;
  const lower = url.toLowerCase();
  return lower.includes("noop.jpeg") || lower.includes("noop.webp") || lower.includes("placeholder");
}

function setupDouyinDetailInterceptor(page) {
  let detail = null;
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/aweme/v1/web/aweme/detail/") &&
        !url.includes("/aweme/v1/web/aweme/related/") &&
        !url.includes("/aweme/v1/web/aweme/post/")) return;
    response
      .json()
      .then((json) => {
        if (json?.aweme_detail) detail = json.aweme_detail;
        // 兼容 aweme_list（笔记页 + 个人主页弹窗视频场景）
        if (!detail && json?.aweme_list?.length > 0) detail = json.aweme_list[0];
      })
      .catch(() => {});
  });
  return () => detail;
}

/**
 * 从抖音 React Server Components (RSC) flight data 中提取作品详情。
 * 2026-06 抖音笔记/图文页（/note/xxx，awemeType=68）不再把详情塞进 <script id="RENDER_DATA">，
 * 而是通过 `self.__pace_f.push([1, "7:[\\"$\\",\\"$L9\\",null,{...}]"])` 形式的 RSC payload 下发。
 * 本函数从 page HTML 中还原该 payload 并返回 aweme.detail 对象。
 */
async function readDouyinRscFlightData(page) {
  try {
    const html = await page.content();
    return extractDouyinDetailFromRscHtml(html);
  } catch (err) {
    console.warn(`[metricsFetcher] 抖音 RSC flight data 读取失败: ${err?.message || err}`);
    return null;
  }
}

function extractDouyinDetailFromRscHtml(html) {
  if (!html || !html.includes("__pace_f")) return null;

  // 收集所有 __pace_f.push([1, "..."]) 的字符串参数
  const payloads = [];
  const pushRe = /self\.__pace_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let m;
  while ((m = pushRe.exec(html)) !== null) {
    payloads.push(m[1]);
  }
  if (!payloads.length) return null;

  // 还原 JS 字符串字面量：只还原 \" 和 \\，保留 \n 等转义序列让 JSON 继续解析
  const unescapeJsString = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  for (const raw of payloads) {
    const unescaped = unescapeJsString(raw);
    // 找到包含 awemeId 的 RSC 行（7:["$","$L9",null,{...}]）
    const idx = unescaped.indexOf('"awemeId"');
    if (idx === -1) continue;

    // 向前找到该对象的起始大括号
    let start = -1;
    let braceCount = 0;
    for (let i = idx; i >= 0; i--) {
      if (unescaped[i] === "}") braceCount++;
      if (unescaped[i] === "{") {
        if (braceCount === 0) {
          start = i;
          break;
        }
        braceCount--;
      }
    }
    if (start === -1) continue;

    // 向后找到匹配的大括号
    braceCount = 0;
    let inString = false;
    let escape = false;
    let end = start;
    for (let i = start; i < unescaped.length; i++) {
      const c = unescaped[i];
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === "{") braceCount++;
      if (c === "}") {
        braceCount--;
        if (braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) continue;

    let jsonStr = unescaped.slice(start, end);
    jsonStr = jsonStr.replace(/"\$undefined"/g, "null").replace(/"\$L\d+"/g, "null");
    jsonStr = jsonStr.replace(/:\$undefined([,}])/g, ":null$1");

    try {
      const data = JSON.parse(jsonStr);
      const detail = data?.aweme?.detail || data?.detail || data;
      if (detail?.awemeId || detail?.aweme_id) {
        console.log(`[metricsFetcher] 抖音 RSC flight data 命中 awemeId=${detail.awemeId || detail.aweme_id}`);
        return detail;
      }
    } catch (parseErr) {
      console.warn(`[metricsFetcher] 抖音 RSC payload JSON 解析失败: ${parseErr?.message || parseErr}`);
      continue;
    }
  }
  return null;
}

async function inferDouyinCountsFromHtml(page, videoId) {
  const html = await page.content().catch(() => "");
  return inferDouyinCountsFromHtmlText(html, videoId);
}

function inferDouyinCountsFromHtmlText(html, videoId) {
  if (!html) {
    console.log(`[metricsFetcher] 抖音 HTML 为空，跳过正则提取`);
    return { likes: null, comments: null, favorites: null, shares: null };
  }
  console.log(`[metricsFetcher] 抖音 HTML 大小: ${html.length} bytes, videoId: ${videoId || '未提取'}`);

  // ── 精确提取：按 videoId 定位当前视频的 JSON 对象 ──
  if (videoId) {
    const vidStr = String(videoId);
    // RENDER_DATA 结构：...,"videoId":{...,"statistics":{...}}...
    const videoBlockRe = new RegExp(
      `"${vidStr}"\\s*:\\s*\\{[\\s\\S]{0,2000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`,
      "i"
    );
    const blockMatch = html.match(videoBlockRe);
    if (blockMatch?.[1]) {
      const block = blockMatch[1];
      const extract = (key) => {
        const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, "i");
        const m = block.match(re);
        return m ? Number(m[1]) : null;
      };
      const likes = extract("digg_count");
      const comments = extract("comment_count");
      const favorites = extract("collect_count");
      const shares = extract("share_count");
      console.log(`[metricsFetcher] 按 videoId=${vidStr} 定位: 赞${likes} 评${comments} 藏${favorites} 分享${shares}`);
      if (likes !== null || comments !== null || favorites !== null || shares !== null) {
        return { likes, comments, favorites, shares };
      }
    } else {
      console.log(`[metricsFetcher] 未找到 videoId=${vidStr} 的 statistics 块`);
    }

    // 尝试 JSON 路径：C_ii / video / detail / statistics
    const jsonBlockRe = new RegExp(
      `"${vidStr}"[\\s\\S]{0,3000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`,
      "i"
    );
    const jsonMatch = html.match(jsonBlockRe);
    if (jsonMatch?.[1]) {
      const block = jsonMatch[1];
      const extract = (key) => {
        const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, "i");
        const m = block.match(re);
        return m ? Number(m[1]) : null;
      };
      const likes = extract("digg_count");
      const comments = extract("comment_count");
      const favorites = extract("collect_count");
      const shares = extract("share_count");
      console.log(`[metricsFetcher] JSON 路径定位(videoId=${vidStr}): 赞${likes} 评${comments} 藏${favorites} 分享${shares}`);
      if (likes !== null || comments !== null || favorites !== null || shares !== null) {
        return { likes, comments, favorites, shares };
      }
    }
  }

  // ── 兜底：全局首次匹配（可能命中推荐视频数据，仅供参考）──
  const readByPatterns = (patterns, label) => {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = match?.[1];
      if (value === undefined) continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) {
        console.log(`[metricsFetcher] 抖音 兜底匹配 ${label}: ${value} (pattern: ${pattern})`);
        return numeric;
      }
    }
    return null;
  };

  const result = {
    likes: readByPatterns([/"digg_count"\s*:\s*(\d+)/i, /"like_count"\s*:\s*(\d+)/i], "likes"),
    comments: readByPatterns([/"comment_count"\s*:\s*(\d+)/i], "comments"),
    favorites: readByPatterns([/"collect_count"\s*:\s*(\d+)/i, /"favorite_count"\s*:\s*(\d+)/i], "favorites"),
    shares: readByPatterns([/"share_count"\s*:\s*(\d+)/i], "shares"),
  };
  console.log(`[metricsFetcher] 抖音 兜底结果(可能非当前视频): 赞${result.likes} 评${result.comments} 藏${result.favorites} 分享${result.shares}`);
  return result;
}

async function readXiaohongshuEngageBar(page) {
  return page.evaluate(() => {
    const root =
      document.querySelector(".interactions.engage-bar .interact-container") ||
      document.querySelector(".engage-bar .interact-container");
    if (!root) return null;

    const read = (selector) => {
      const text = root.querySelector(selector)?.textContent?.trim() || "";
      return text || null;
    };

    return {
      likes: read(".like-wrapper .count"),
      favorites: read(".collect-wrapper .count"),
      comments: read(".chat-wrapper .count"),
      shares: read(".share-wrapper .count")
    };
  }).catch(() => null);
}

async function readXiaohongshuInitialState(page, preferredNoteId) {
  return page.evaluate((targetId) => {
    const root = window.__INITIAL_STATE__ || window.__initialState__ || null;
    if (!root || typeof root !== "object") return null;

    // 展开候选：从各种可能的路径收集 note 级数据
    const rawCandidates = [];

    if (root.note?.noteDetailMap && typeof root.note.noteDetailMap === "object") {
      rawCandidates.push(...Object.values(root.note.noteDetailMap));
    }
    if (root.noteData?.data?.noteData) {
      rawCandidates.push(root.noteData.data.noteData);
    }
    if (root.data?.noteData?.data?.noteData) {
      rawCandidates.push(root.data.noteData.data.noteData);
    }
    if (root.noteData?.noteData) {
      rawCandidates.push(root.noteData.noteData);
    }
    if (root.noteCard) {
      rawCandidates.push(root.noteCard);
    }

    // 将每个原始候选展开为扁平化的 note 数据对象（处理深度嵌套）
    const notes = [];
    for (const raw of rawCandidates) {
      if (!raw || typeof raw !== "object") continue;
      // noteDetailMap 的值可能形如 { note: { ... } } 或 { data: { note: { ... } } }
      const target = raw.note || raw.data?.note || raw.noteData || raw;
      if (target && typeof target === "object") {
        notes.push(target);
      }
    }

    // 优先使用与当前 URL 笔记 ID 匹配的 note
    if (targetId) {
      const idx = notes.findIndex((n) =>
        String(n.id || n.note_id || n.noteId || "").trim() === targetId,
      );
      if (idx > 0) {
        const [matched] = notes.splice(idx, 1);
        notes.unshift(matched);
      }
    }

    const pickCount = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const text = String(value).trim();
      return text || null;
    };

    const extractUser = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      const u = obj.user || obj.author || obj.authorInfo || {};
      if (!u || typeof u !== "object") return null;
      return {
        authorName: String(u.nickname || u.name || u.userName || "").trim() || undefined,
        authorId: String(u.userId || u.user_id || u.id || "").trim() || undefined,
      };
    };

    for (const note of notes) {
      if (!note || typeof note !== "object") continue;
      const interact = note.interact_info || note.interactInfo || {};
      const likes = pickCount(interact.liked_count ?? interact.likedCount ?? note.liked_count ?? note.likedCount);
      const comments = pickCount(interact.comment_count ?? interact.commentCount ?? note.comment_count ?? note.commentCount ?? note.comments_count);
      const favorites = pickCount(interact.collected_count ?? interact.collectedCount ?? interact.collect_count ?? interact.collectCount ?? note.collected_count ?? note.collectedCount);
      const shares = pickCount(interact.share_count ?? interact.shareCount ?? interact.shared_count ?? interact.sharedCount ?? note.share_count ?? note.shareCount);
      const title = String(note.title || note.display_title || note.note_title || note.desc || "").trim();
      const author = extractUser(note);
      if (likes !== null || comments !== null || favorites !== null || shares !== null || title) {
        return { likes, comments, favorites, shares, title, ...(author || {}) };
      }
    }

    // 兜底：只提取标题和作者（无互动数据时）
    for (const note of notes) {
      const title = String(note.title || note.display_title || note.note_title || note.desc || "").trim();
      const author = extractUser(note);
      if (title || author) {
        return { likes: null, comments: null, favorites: null, shares: null, title, ...(author || {}) };
      }
    }

    return null;
  }).catch(() => null);
}

async function inferXiaohongshuCountsFromHtml(page) {
  const html = await page.content().catch(() => "");
  if (!html) {
    return {
      likes: null,
      comments: null,
      favorites: null,
      shares: null
    };
  }

  const readByPatterns = (patterns) => {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = match?.[1];
      if (value === undefined) continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    }
    return null;
  };

  return {
    likes: readByPatterns([
      /"likedCount"\s*:\s*(\d+)/i,
      /"liked_count"\s*:\s*(\d+)/i,
      /"likes"\s*:\s*(\d+)/i
    ]),
    comments: readByPatterns([
      /"commentCount"\s*:\s*(\d+)/i,
      /"comment_count"\s*:\s*(\d+)/i,
      /"comments"\s*:\s*(\d+)/i
    ]),
    favorites: readByPatterns([
      /"collectedCount"\s*:\s*(\d+)/i,
      /"collected_count"\s*:\s*(\d+)/i,
      /"collectCount"\s*:\s*(\d+)/i,
      /"collect_count"\s*:\s*(\d+)/i,
      /"favorites"\s*:\s*(\d+)/i
    ]),
    shares: readByPatterns([
      /"shareCount"\s*:\s*(\d+)/i,
      /"share_count"\s*:\s*(\d+)/i,
      /"shareNum"\s*:\s*(\d+)/i,
      /"share_num"\s*:\s*(\d+)/i
    ])
  };
}

async function inferCountsFromBody(page) {
  const text = await page.locator("body").innerText().catch(() => "");
  const likes = parseCount(text.match(/点赞\s*([\d.,wkW万千]+)/)?.[1]);
  const comments = parseCount(text.match(/评论\s*([\d.,wkW万千]+)/)?.[1]);
  const favorites =
    parseCount(text.match(/收藏\s*([\d.,wkW万千]+)/)?.[1]) ??
    parseCount(text.match(/收藏夹\s*([\d.,wkW万千]+)/)?.[1]);
  const shares = parseCount(text.match(/分享\s*([\d.,wkW万千]+)/)?.[1]);
  const totalComments = parseCount(text.match(/共\s*([\d.,wkW万千]+)\s*条评论/)?.[1]);
  const footerTripleMatch = text.match(/登录后评论\s*([\d.,wkW万千]+)\s*([\d.,wkW万千]+)\s*([\d.,wkW万千]+)\s*发送/);
  const composerTripleMatch = text.match(/说点什么\.\.\.\s*([\d.,wkW万千]+)\s*([\d.,wkW万千]+)\s*([\d.,wkW万千]+)\s*发送/);
  const footerLikes = parseCount(footerTripleMatch?.[1]);
  const footerFavorites = parseCount(footerTripleMatch?.[2]);
  const footerComments = parseCount(footerTripleMatch?.[3]);
  const composerLikes = parseCount(composerTripleMatch?.[1]);
  const composerFavorites = parseCount(composerTripleMatch?.[2]);
  const composerComments = parseCount(composerTripleMatch?.[3]);
  return {
    text,
    likes: composerLikes ?? footerLikes ?? likes,
    comments: composerComments ?? totalComments ?? footerComments ?? comments,
    favorites: composerFavorites ?? footerFavorites ?? favorites,
    shares
  };
}

async function readXiaohongshuMetaTags(page) {
  return page.evaluate(() => {
    const getMeta = (attr, value) => {
      const el = document.querySelector(`meta[${attr}="${value}"]`);
      return el?.getAttribute?.("content")?.trim() || "";
    };
    const title = getMeta("property", "og:title") || getMeta("name", "title") || "";
    const description = getMeta("property", "og:description") || getMeta("name", "description") || "";
    const authorName = getMeta("property", "og:author") || getMeta("name", "author") || "";
    return { title, description, authorName };
  }).catch(() => null);
}

async function readXiaohongshuTitleByXPath(page) {
  try {
    const title = await page.evaluate(() => {
      try {
        const result = document.evaluate(
          '//*[@id="detail-title"]',
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        const node = result.singleNodeValue;
        return node ? (node.textContent || "").trim() : "";
      } catch {
        return "";
      }
    });
    if (title) {
      console.log(`[metricsFetcher] 小红书 XPath 标题命中: ${title.slice(0, 80)}`);
      return title;
    }
  } catch (err) {
    console.warn(`[metricsFetcher] 小红书 XPath 标题读取失败: ${err?.message || err}`);
  }
  return "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseXiaohongshuDateText(text) {
  if (!text) return null;
  const raw = String(text).trim();
  const now = new Date();
  const currentYear = now.getFullYear();

  // 2024-06-12 / 2024/06/12
  let m = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  // 2024年06月12日
  m = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  // 06-12 / 06/12（默认当年）
  m = raw.match(/(\d{1,2})[\/-](\d{1,2})/);
  if (m) return `${currentYear}-${pad2(m[1])}-${pad2(m[2])}`;

  // 昨天 / 今天
  if (/昨天/.test(raw)) {
    const d = new Date(now.getTime() - 86400000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  if (/今天/.test(raw)) {
    return `${currentYear}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  return null;
}

async function readXiaohongshuPublishDate(page) {
  try {
    const dateText = await page.evaluate(() => {
      try {
        // 用户提供的 CSS Path
        const el = document.querySelector(
          "#noteContainer > div.interaction-container > div.note-scroller > div.note-content > div.bottom-container > span.date",
        );
        if (el) return (el.textContent || "").trim();
        // 兜底：任意 #noteContainer 下的 .date
        const fallback = document.querySelector("#noteContainer span.date");
        return fallback ? (fallback.textContent || "").trim() : "";
      } catch {
        return "";
      }
    });
    const parsed = parseXiaohongshuDateText(dateText);
    if (parsed) {
      console.log(`[metricsFetcher] 小红书发布日期命中: ${parsed} (raw=${dateText})`);
      return parsed;
    }
    if (dateText) {
      console.warn(`[metricsFetcher] 小红书发布日期未识别: ${dateText}`);
    }
  } catch (err) {
    console.warn(`[metricsFetcher] 小红书发布日期读取失败: ${err?.message || err}`);
  }
  return null;
}

async function readXiaohongshuAuthorNameFromDom(page) {
  try {
    const name = await page.evaluate(() => {
      try {
        // 用户提供的 CSS Path
        const el = document.querySelector(
          "#noteContainer > div.interaction-container > div.author-container > div > div.info > a > span",
        );
        if (el) return (el.textContent || "").trim();
        // 兜底：#noteContainer 下 .author-container .info a span
        const fallback = document.querySelector("#noteContainer .author-container .info a span");
        if (fallback) return (fallback.textContent || "").trim();
        // 再兜底：常见昵称选择器
        const fallback2 = document.querySelector("#noteContainer .author-wrapper .nickname, #noteContainer .author-info .username");
        return fallback2 ? (fallback2.textContent || "").trim() : "";
      } catch {
        return "";
      }
    });
    if (name) {
      console.log(`[metricsFetcher] 小红书 DOM 作者命中: ${name.slice(0, 60)}`);
      return name;
    }
  } catch (err) {
    console.warn(`[metricsFetcher] 小红书 DOM 作者读取失败: ${err?.message || err}`);
  }
  return "";
}

async function readXiaohongshuAuthorUrlFromDom(page) {
  try {
    const href = await page.evaluate(() => {
      try {
        // 用户提供的 CSS Path（取 a 标签的 href）
        const el = document.querySelector(
          "#noteContainer > div.interaction-container > div.author-container > div > div.info > a",
        );
        if (el?.href) return el.href;
        // 兜底
        const fallback = document.querySelector("#noteContainer .author-container .info a");
        return fallback?.href || "";
      } catch {
        return "";
      }
    });
    if (href) {
      console.log(`[metricsFetcher] 小红书作者主页命中: ${href.slice(0, 120)}`);
      return href;
    }
  } catch (err) {
    console.warn(`[metricsFetcher] 小红书作者主页读取失败: ${err?.message || err}`);
  }
  return "";
}

function extractXiaohongshuUserIdFromProfileUrl(url) {
  const value = String(url || "");
  const match = value.match(/\/user\/profile\/([a-zA-Z0-9]+)/);
  return match ? match[1] : "";
}

async function scrapeXiaohongshu(page, providedNoteId = null, apiDetail = null) {
  const noteId = providedNoteId || extractXiaohongshuNoteId(page.url());

  // ── Tier 1：API note_card 优先（来自 /api/sns/web/v{1,2}/feed） ──
  let apiMetrics = null;
  let apiPublishDate = "";
  if (apiDetail && typeof apiDetail === "object") {
    const u = apiDetail.user || {};
    const i = apiDetail.interact_info || {};
    const pickN = (v) => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    apiMetrics = {
      title: String(apiDetail.title || apiDetail.display_title || apiDetail.desc || "").trim(),
      authorName: String(u.nickname || u.name || "").trim(),
      authorId: String(u.user_id || u.userId || "").trim(),
      likes: pickN(i.liked_count ?? i.likedCount),
      comments: pickN(i.comment_count ?? i.commentCount),
      favorites: pickN(i.collected_count ?? i.collectedCount),
      shares: pickN(i.share_count ?? i.shareCount),
    };
    if (apiDetail.time) {
      try {
        const ts = Number(apiDetail.time);
        if (Number.isFinite(ts)) {
          // time 字段一般是毫秒；< 1e12 时按秒处理
          const d = new Date(ts < 1e12 ? ts * 1000 : ts);
          if (!Number.isNaN(d.getTime())) {
            apiPublishDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
          }
        }
      } catch {}
    }
    console.log(`[metricsFetcher] 小红书 API 层: title=${apiMetrics.title.slice(0, 60)} 赞${apiMetrics.likes} 评${apiMetrics.comments} 藏${apiMetrics.favorites} 分享${apiMetrics.shares}`);
  }

  const initialState = await readXiaohongshuInitialState(page, noteId);
  const precise = await readXiaohongshuEngageBar(page);
  const htmlFallback = await inferXiaohongshuCountsFromHtml(page);
  const metaTags = await readXiaohongshuMetaTags(page);
  const xpathTitle = await readXiaohongshuTitleByXPath(page);
  const publishDate = await readXiaohongshuPublishDate(page);
  const domAuthorName = await readXiaohongshuAuthorNameFromDom(page);
  const domAuthorUrl = await readXiaohongshuAuthorUrlFromDom(page);
  const domAuthorId = extractXiaohongshuUserIdFromProfileUrl(domAuthorUrl);

  // Body 文本兜底（用于登录墙检测和 DOM 文本提取）
  const fallback = await inferCountsFromBody(page);

  const likes = parseCount(apiMetrics?.likes) ?? parseCount(initialState?.likes) ?? parseCount(precise?.likes) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .like-wrapper .count",
    ".engage-bar .interact-container .like-wrapper .count",
    "[class*='like'] [class*='count']",
    "[data-testid*='like'] [class*='count']"
  ]);
  const comments = parseCount(apiMetrics?.comments) ?? parseCount(initialState?.comments) ?? parseCount(precise?.comments) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .chat-wrapper .count",
    ".engage-bar .interact-container .chat-wrapper .count",
    "[class*='chat'] [class*='count']",
    "[class*='comment'] [class*='count']"
  ]);
  const favorites = parseCount(apiMetrics?.favorites) ?? parseCount(initialState?.favorites) ?? parseCount(precise?.favorites) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .collect-wrapper .count",
    ".engage-bar .interact-container .collect-wrapper .count",
    "[class*='collect'] [class*='count']",
    "[class*='favorite'] [class*='count']"
  ]);
  const shares = parseCount(apiMetrics?.shares) ?? parseCount(initialState?.shares) ?? parseCount(precise?.shares) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .share-wrapper .count",
    ".engage-bar .interact-container .share-wrapper .count",
    "[class*='share'] [class*='count']",
    "[data-testid*='share'] [class*='count']"
  ]);

  // 标题：API > INITIAL_STATE > XPath #detail-title > meta og:title > empty
  const title = apiMetrics?.title || initialState?.title || xpathTitle || metaTags?.title || metaTags?.description || "";
  const titleSource = apiMetrics?.title ? "api" : initialState?.title ? "initialState" : xpathTitle ? "xpath" : metaTags?.title ? "meta-title" : metaTags?.description ? "meta-description" : "empty";
  console.log(`[metricsFetcher] 小红书标题来源: ${titleSource}, title=${title.slice(0, 80)}`);
  // 作者：DOM > INITIAL_STATE > meta og:author > empty
  const authorName = domAuthorName || initialState?.authorName || metaTags?.authorName || "";
  // 作者 ID：优先从主页链接解析 userId，其次 SSR
  const authorId = domAuthorId || initialState?.authorId || "";
  const authorSource = domAuthorName ? "dom" : initialState?.authorName ? "initialState" : metaTags?.authorName ? "meta" : "empty";
  console.log(`[metricsFetcher] 小红书作者来源: ${authorSource}, authorName=${authorName.slice(0, 60)}, authorId=${authorId}`);

  return {
    bodyText: fallback.text,
    title,
    authorName,
    authorId,
    publishDate: apiPublishDate || publishDate,
    likes: likes ?? htmlFallback.likes ?? fallback.likes ?? 0,
    comments: comments ?? htmlFallback.comments ?? fallback.comments ?? 0,
    favorites: favorites ?? htmlFallback.favorites ?? fallback.favorites ?? 0,
    shares: shares ?? htmlFallback.shares ?? fallback.shares ?? 0
  };
}

/**
 * 抖音 4 项指标（点赞/评论/收藏/分享）抓取。
 *
 * 难点（2026-06-06 用户实测反馈）：
 *   1. class 名是动态 hash（e6fO4odE MaBqgDY7 V1JBLS7f），`[class*="like"]` 全 0 命中。
 *   2. "点赞"等中文文本只在 hover 时作为 tooltip 出现，selector 抓不到。
 *   3. 绝对 xpath 会随登录态 / 视频/图文页变化：
 *      - 视频页：#sliderVideo/div[1]/div/.../div[2]
 *      - 图文/笔记页：#douyin-right-container/div[2]/main/div[1]/div[2]/...
 *   4. 数字在心形 SVG 图标"下方"（子节点或紧邻 div），不是兄弟。
 *
 * 解法：page.evaluate 单次扫描 DOM —— 在 #douyin-right-container / #sliderVideo
 *   容器内找 4 个交互按钮（按 SVG 路径特征：心 / 评论气泡 / 五角星 / 转发箭头），
 *   拿它们紧邻的数字子节点。同时扫 INITIAL_STATE 拿兜底（`likeCount` 字段）。
 */
/**
 * 抖音 4 项指标（点赞/评论/收藏/分享）抓取。
 *
 * 难点（2026-06-06 用户实测反馈）：
 *   1. class 名是动态 hash（e6fO4odE MaBqgDY7 V1JBLS7f），`[class*="like"]` 全 0 命中。
 *   2. "点赞"等中文文本只在 hover 时作为 tooltip 出现，selector 抓不到。
 *   3. 绝对 xpath 会随登录态 / 视频/图文页变化。
 *   4. **关键**：抖音把数字拆成多个 span/div 做动画，"1.9万" = 两个节点 "1" + "9万"。
 *      直接 textContent 只能拿到 "9" 漏 "1"，所以"按位置拿全部数字节点再合并"是唯一可靠方式。
 *
 * 解法：page.evaluate 单次扫 #douyin-right-container 容器，定位 4 个交互按钮的容器
 *   （按 DOM 顺序），每个容器内合并所有数字文本（"9" + "万" → "9万" → 9000）。
 */
/**
 * 从抖音页面 HTML 中提取 <script id="RENDER_DATA"> 里的 SSR 数据。
 * RENDER_DATA 是 URL-encoded JSON，解码后含 aweme_detail.statistics。
 * 直接搜索含 digg_count + comment_count 的 statistics 对象（不依赖具体路径）。
 */
async function readDouyinRenderData(page) {
  try {
    const html = await page.content();
    return extractDouyinRenderDataFromHtml(html);
  } catch (err) {
    console.warn(`[metricsFetcher] 抖音 RENDER_DATA 读取失败: ${err?.message || err}`);
    return null;
  }
}

function extractDouyinRenderDataFromHtml(html) {
  try {
    if (!html) return null;
    const match = html.match(/<script\s+id="RENDER_DATA"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match?.[1]) return null;
    let decoded = match[1].trim();
    try { decoded = decodeURIComponent(decoded); } catch {}
    if (decoded.startsWith("%")) {
      try { decoded = decodeURIComponent(decoded); } catch {}
    }
    const json = JSON.parse(decoded);

    // 直接搜索含 digg_count + comment_count 的 statistics 对象（不依赖 aweme_detail 路径）
    const pick = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const candidates = [];
    const walk = (obj, depth) => {
      if (!obj || typeof obj !== "object" || depth > 8) return;
      if (obj.statistics && typeof obj.statistics === "object"
        && ("digg_count" in obj.statistics || "comment_count" in obj.statistics)) {
        const s = obj.statistics;
        const likes = pick(s.digg_count ?? s.like_count);
        const comments = pick(s.comment_count);
        const favorites = pick(s.collect_count ?? s.favorite_count);
        const shares = pick(s.share_count);
        // 质量分：命中字段越多越可信
        const score = [likes, comments, favorites, shares].filter((v) => v !== null).length;
        candidates.push({
          likes, comments, favorites, shares,
          title: String(obj.desc || obj.title || "").trim(),
          score,
          digg: Number(s.digg_count || 0),
        });
      }
      for (const v of Object.values(obj)) walk(v, depth + 1);
    };
    walk(json, 0);

    if (!candidates.length) return null;

    // 选质量分最高的；同分时取 digg_count 最大的（真实视频数据通常有大量点赞）
    candidates.sort((a, b) => b.score - a.score || b.digg - a.digg);
    const best = candidates[0];

    console.log(`[metricsFetcher] RENDER_DATA 找到 ${candidates.length} 个 statistics 对象，选用第一个: 赞${best.likes} 评${best.comments} 藏${best.favorites} 分享${best.shares}`);

    if (best.likes === null && best.comments === null && best.favorites === null && best.shares === null) {
      return null;
    }
    return best;
  } catch (err) {
    console.warn(`[metricsFetcher] 抖音 RENDER_DATA 提取失败: ${err?.message || err}`);
    return null;
  }
}

async function scrapeDouyin(page, apiDetail = null, preRscDetail = null) {
  const currentUrl = page.url();
  const videoId = extractDouyinVideoId(currentUrl);
  console.log(`[metricsFetcher] 抖音 scrapeDouyin: url=${currentUrl}, videoId=${videoId || '未提取'}`);

  // ── Layer 0a: API detail（最快最准，外部 page.waitForResponse 已拿到响应） ──
  const apiMetrics = apiDetail ? extractDouyinFromDetail(apiDetail) : null;
  if (apiMetrics) {
    console.log(`[metricsFetcher] 抖音 API 层: title=${apiMetrics.title.slice(0, 60)} 赞${apiMetrics.likes} 评${apiMetrics.comments} 藏${apiMetrics.favorites} 分享${apiMetrics.shares}`);
  }

  // ── 优化 #3：一次拿 HTML，RSC / RENDER_DATA / HTML 正则三层复用 ──
  const html = await page.content().catch(() => "");

  // ── Layer 0b: RSC flight data（优先用预提取数据，避免重复 page.content()） ──
  const rscDetail = preRscDetail || (html ? extractDouyinDetailFromRscHtml(html) : null);
  const rscMetrics = rscDetail ? extractDouyinFromDetail(rscDetail) : null;
  if (rscMetrics) {
    console.log(`[metricsFetcher] 抖音 RSC 层: title=${rscMetrics.title.slice(0, 60)}, author=${rscMetrics.authorName}, 赞${rscMetrics.likes} 评${rscMetrics.comments} 藏${rscMetrics.favorites} 分享${rscMetrics.shares}`);
  }

  // ── Layer 0.5: 传统 RENDER_DATA（兼容旧版视频页） ──
  const renderData = extractDouyinRenderDataFromHtml(html);
  if (renderData) {
    console.log(`[metricsFetcher] 抖音 RENDER_DATA 层: 赞${renderData.likes} 评${renderData.comments} 藏${renderData.favorites} 分享${renderData.shares}`);
  }

  // ── Layer 1: HTML 正则，按 videoId 精确定位 ──
  const htmlFallback = inferDouyinCountsFromHtmlText(html, videoId);

  // ── 优化 #1：高优先级 source 已拿全 4 项 → 跳过昂贵 DOM 兜底（节省 1-2s） ──
  const isReliable = (m) =>
    m && m.likes > 0 && m.comments != null && m.favorites != null && m.shares != null;
  const canShortCircuit = isReliable(apiMetrics) || isReliable(rscMetrics);

  let xpathCounts = null;
  let interactiveCounts = null;
  let fallback = { text: "", likes: null, comments: null, favorites: null, shares: null };

  if (canShortCircuit) {
    console.log(`[metricsFetcher] 抖音 短路：${isReliable(apiMetrics) ? 'API' : 'RSC'} 已拿全 4 项指标，跳过 hover/XPath/DOM 扫描/body 文本兜底`);
  } else {
    // ── Layer 2: DOM 扫描前 hover 让 tooltip 出来 ──
    try {
      const hoverTargets = await page.locator(
        '#douyin-right-container svg, #sliderVideo svg'
      ).all();
      for (const t of hoverTargets.slice(0, 8)) {
        try { await t.hover({ timeout: 200 }); } catch {}
      }
    } catch {}

    // ── Layer 1.5: XPath 精确定位（抖音笔记页/图文页） ──
    // 当 SVG walk 方案因 DOM 结构变化失败时，用固定 XPath 兜底。
    xpathCounts = await page.evaluate(() => {
      const parseNum = (text) => {
        if (!text) return 0;
        const m = text.trim().match(/(\d+(?:\.\d+)?)\s*([wkW万千K]?)/i);
        if (!m) return 0;
        let v = parseFloat(m[1]);
        const u = m[2].toLowerCase();
        if (u === "w" || u === "万") v *= 10000;
        else if (u === "k" || u === "千") v *= 1000;
        return Math.round(v);
      };
      const xpath = (expr) => {
        try {
          const r = document.evaluate(expr, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return r.singleNodeValue ? (r.singleNodeValue.textContent || "").trim() : "";
        } catch { return ""; }
      };
      const likes = parseNum(xpath('//*[@id="sliderVideo"]/div[1]/div/div[1]/div[1]/div/div[2]/div[2]/div[1]/div[2]'));
      const comments = parseNum(xpath('//*[@id="sliderVideo"]/div[1]/div/div[1]/div[1]/div/div[2]/div[3]/div[1]/div[2]'));
      const favorites = parseNum(xpath('//*[@id="sliderVideo"]/div[1]/div/div[1]/div[1]/div/div[2]/div[4]/div[2]'));
      const shares = parseNum(xpath('//*[@id="sliderVideo"]/div[1]/div/div[1]/div[1]/div/div[2]/div[5]/div[1]/div[2]'));
      return { likes, comments, favorites, shares };
    }).catch(() => null);

    // 单次 page.evaluate 拿 4 项指标（按 DOM 位置：[点赞, 评论, 收藏, 分享]）
    interactiveCounts = await page.evaluate(() => {
      const root = document.getElementById('douyin-right-container');
      if (!root) return null;

      // 抖音把数字拆成多个 span 做位移动画。策略：递归收集容器内所有"纯数字文本"span，
      // 按文档顺序拼接。还需处理"万 / w"这种单位后缀。
      const collectNumbers = (el) => {
        if (!el) return { value: 0, raw: "" };
        // 收集所有叶子级文本节点
        const text = el.innerText || el.textContent || "";
        // 提取数字和单位：1.9万 / 1.9w / 19000
        const match = text.match(/(\d+(?:\.\d+)?)\s*([wkW万千K]?)/);
        if (!match) return { value: 0, raw: "" };
        const num = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        let val = num;
        if (unit === "w" || unit === "万") val = num * 10000;
        else if (unit === "k" || unit === "千") val = num * 1000;
        return { value: Math.round(val), raw: text.trim() };
      };

      // 找含 SVG 的按钮容器（心 / 评论 / 收藏 / 分享），按 DOM 顺序
      const buttons = [];
      const walk = (node) => {
        if (node.tagName === "svg") {
          // 找最近的有 innerText 的祖先容器
          let p = node.parentElement;
          for (let i = 0; i < 5 && p; i++) {
            const txt = (p.innerText || "").trim();
            if (txt && /\d/.test(txt) && p.children.length <= 4) {
              buttons.push(p);
              return;
            }
            p = p.parentElement;
          }
        }
        for (const c of node.children || []) walk(c);
      };
      walk(root);

      // 抖音图文/笔记页结构：每个交互按钮包一层 div，div 里有 SVG + 数字 span
      //   直接取每个按钮的 innerText（含 SVG 旁所有数字节点拼接）
      const result = { likes: 0, comments: 0, favorites: 0, shares: 0 };
      if (buttons.length >= 4) {
        const keys = ["likes", "comments", "favorites", "shares"];
        for (let i = 0; i < 4; i++) {
          const { value, raw } = collectNumbers(buttons[i]);
          if (value) result[keys[i]] = value;
        }
      } else {
        // 兜底：按 innerText 顺序抓 4 个数字（适配 DOM 结构变化）
        const text = root.innerText || "";
        const matches = text.match(/\d+(?:\.\d+)?\s*[wkW万千K]?/g) || [];
        if (matches.length >= 4) {
          const parse = (s) => {
            const m = s.match(/(\d+(?:\.\d+)?)\s*([wkW万千K]?)/);
            if (!m) return 0;
            let v = parseFloat(m[1]);
            const u = m[2].toLowerCase();
            if (u === "w" || u === "万") v *= 10000;
            else if (u === "k" || u === "千") v *= 1000;
            return Math.round(v);
          };
          result.likes = parse(matches[0]);
          result.comments = parse(matches[1]);
          result.favorites = parse(matches[2]);
          result.shares = parse(matches[3]);
        }
      }
      return result;
    }).catch(() => null);

    fallback = await inferCountsFromBody(page);
  }

  // 优先级：API detail > RSC > RENDER_DATA > HTML 正则 > XPath > DOM 扫描 > body text
  const sources = { likes: "", comments: "", favorites: "", shares: "" };
  const get = (k) => {
    if (apiMetrics?.[k] != null && apiMetrics[k] > 0) { sources[k] = "api"; return apiMetrics[k]; }
    if (rscMetrics?.[k] != null && rscMetrics[k] > 0) { sources[k] = "rsc"; return rscMetrics[k]; }
    if (renderData?.[k] != null) { sources[k] = "render-data"; return renderData[k]; }
    if (htmlFallback[k] != null) { sources[k] = "html-regex"; return htmlFallback[k]; }
    if (xpathCounts?.[k]) { sources[k] = "xpath"; return xpathCounts[k]; }
    if (interactiveCounts?.[k]) { sources[k] = "dom-scan"; return interactiveCounts[k]; }
    if (fallback[k]) { sources[k] = "body-text"; return fallback[k]; }
    sources[k] = "default(0)";
    return 0;
  };
  const result = {
    bodyText: fallback.text,
    title: apiMetrics?.title || rscMetrics?.title || renderData?.title || "",
    authorName: apiMetrics?.authorName || rscMetrics?.authorName || "",
    authorId: apiMetrics?.authorId || rscMetrics?.authorId || "",
    publishDate: apiMetrics?.publishDate || rscMetrics?.publishDate || "",
    likes: get("likes"),
    comments: get("comments"),
    favorites: get("favorites"),
    shares: get("shares"),
  };
  console.log(`[metricsFetcher] 抖音 最终数据来源: ${JSON.stringify(sources)}`);
  console.log(`[metricsFetcher] 抖音 API层:    赞${apiMetrics?.likes ?? 'null'} 评${apiMetrics?.comments ?? 'null'} 藏${apiMetrics?.favorites ?? 'null'} 分享${apiMetrics?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 RSC层:    title=${result.title.slice(0, 60)} author=${result.authorName} date=${result.publishDate}`);
  console.log(`[metricsFetcher] 抖音 RSC层:    赞${rscMetrics?.likes ?? 'null'} 评${rscMetrics?.comments ?? 'null'} 藏${rscMetrics?.favorites ?? 'null'} 分享${rscMetrics?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 RENDER层: 赞${renderData?.likes ?? 'null'} 评${renderData?.comments ?? 'null'} 藏${renderData?.favorites ?? 'null'} 分享${renderData?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 HTML层:   赞${htmlFallback.likes} 评${htmlFallback.comments} 藏${htmlFallback.favorites} 分享${htmlFallback.shares}`);
  console.log(`[metricsFetcher] 抖音 XPath层:  赞${xpathCounts?.likes ?? 'null'} 评${xpathCounts?.comments ?? 'null'} 藏${xpathCounts?.favorites ?? 'null'} 分享${xpathCounts?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 DOM层:    赞${interactiveCounts?.likes ?? 'null'} 评${interactiveCounts?.comments ?? 'null'} 藏${interactiveCounts?.favorites ?? 'null'} 分享${interactiveCounts?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 body层:   赞${fallback.likes} 评${fallback.comments} 藏${fallback.favorites} 分享${fallback.shares}`);
  return result;
}

function looksLikeLoginWall(platform, bodyText, pageTitle = "") {
  const text = String(bodyText || "");
  const title = String(pageTitle || "").trim();
  if (platform === "小红书") {
    const hasPostSignals =
      /共\s*[\d.,wkW万千]+\s*条评论/.test(text) ||
      /登录后评论\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text) ||
      /说点什么\.\.\.\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*[\d.,wkW万千]+\s*发送/.test(text) ||
      /点赞/.test(text) ||
      /评论/.test(text) ||
      /收藏/.test(text) ||
      /\d{2}-\d{2}/.test(text);
    const genericTitle =
      title === "小红书 - 你的生活兴趣社区"
      || title === "小红书"
      || title.includes("你的生活兴趣社区");
    return !hasPostSignals && (
      text.includes("登录后推荐更懂你的笔记")
      || text.includes("手机号登录")
      || text.includes("扫码")
      || text.includes("立即登录")
      || text.includes("打开小红书App查看")
      || genericTitle
    );
  }
  return text.includes("登录后") || text.includes("扫码登录") || text.includes("验证码登录");
}

/**
 * 解析登录浏览器要使用的 profile 目录。
 * 传入 profileDir 时优先使用（多账号：指向 .playwright-profiles/accounts/<code>/<id>），
 * 未传时回退到平台默认目录（.playwright-profiles/{douyin|xiaohongshu}）。
 */
function resolveLoginProfileDir(platform, profileDir) {
  const dir = profileDir && String(profileDir).trim();
  return dir ? path.resolve(dir) : getProfileDir(platform);
}

/**
 * 登录上下文 Map 的 key：platform + profileDir 组合。
 * 保证同一平台的不同子账号各自持有独立登录浏览器，互不覆盖。
 */
function loginContextKey(platform, dir) {
  return `${platform}::${dir}`;
}

async function openLoginBrowser(platform, profileDir) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }

  const dir = resolveLoginProfileDir(platform, profileDir);
  const key = loginContextKey(platform, dir);

  if (loginContexts.has(key)) {
    const { context } = loginContexts.get(key);
    const existing = context.pages()[0] || (await context.newPage());
    await existing.bringToFront().catch(() => {});
    await existing.goto(getPlatformHome(platform), { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }).catch(() => {});
    return { ok: true, platform, profileDir: dir };
  }

  fs.mkdirSync(dir, { recursive: true });
  clearSingletonLocks(dir);

  const linuxArgs = process.platform === "linux"
    ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
    : [];
  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1440, height: 980 },
    args: linuxArgs,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  context.on("close", () => {
    const entry = loginContexts.get(key);
    if (entry && entry.context === context) {
      loginContexts.delete(key);
    }
  });

  loginContexts.set(key, { context, platform, profileDir: dir });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(getPlatformHome(platform), { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }).catch(() => {});
  return { ok: true, platform, profileDir: dir };
}

/**
 * 关闭已打开的登录浏览器（释放 GUI 资源 + context）。
 * 传入 profileDir 时只关闭该账号的登录浏览器；未传时关闭该平台下所有登录浏览器。
 * 没有打开的 context 时返回 ok=false（不算错误）。
 */
async function closeLoginBrowser(platform, profileDir) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }

  // 指定账号：只关闭该 profileDir 的登录浏览器
  if (profileDir && String(profileDir).trim()) {
    const dir = resolveLoginProfileDir(platform, profileDir);
    const entry = loginContexts.get(loginContextKey(platform, dir));
    if (!entry) {
      return { ok: false, platform, profileDir: dir, message: "该账号未打开登录浏览器" };
    }
    await entry.context.close().catch(() => {});
    return { ok: true, platform, profileDir: dir };
  }

  // 未指定账号：关闭该平台下所有登录浏览器
  const entries = [...loginContexts.values()].filter((e) => e.platform === platform);
  if (entries.length === 0) {
    return { ok: false, platform, message: "该平台未打开登录浏览器" };
  }
  for (const entry of entries) {
    await entry.context.close().catch(() => {});
  }
  // context.on("close") 已删除 loginContexts 里的引用
  return { ok: true, platform, closed: entries.length };
}

/**
 * 查询某平台 profile 是否带登录态（基于 Cookies 文件 + Local Storage 目录存在性）。
 * 不读 Cookies 内容（避免解密 SQLite），只看文件存在 + 大小 > 0。
 *
 * 注：Chromium 124+ 把 Cookies 从 Default/Cookies 移到了 Default/Network/Cookies，
 *     两路径都得查，否则新 profile 会误判为未登录。
 */
function getLoginStatus(platform, profileDir) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }
  const dir = resolveLoginProfileDir(platform, profileDir);
  const home = getPlatformHome(platform);
  const exists = fs.existsSync(dir);
  let hasSession = false;
  let cookieSize = 0;
  let cookiePath = null;
  let localStorageExists = false;
  let lastModified = null;
  if (exists) {
    // 新旧 Chromium profile 路径兼容
    const candidateCookiePaths = [
      path.join(dir, "Default", "Network", "Cookies"),  // Chromium 124+
      path.join(dir, "Default", "Cookies"),              // Chromium < 124
    ];
    for (const p of candidateCookiePaths) {
      try {
        const stat = fs.statSync(p);
        if (stat.size > 0) {
          cookiePath = p;
          cookieSize = stat.size;
          lastModified = stat.mtime.toISOString();
          hasSession = true;
          break;
        }
      } catch {}
    }
    localStorageExists = fs.existsSync(path.join(dir, "Default", "Local Storage"));
  }
  return {
    platform,
    profileDir: dir,
    home,
    isOpen: loginContexts.has(loginContextKey(platform, dir)),
    hasSession,
    cookieSize,
    cookiePath,
    localStorageExists,
    lastModified,
  };
}

async function launchProfileContext(platform) {
  const profileDir = getProfileDir(platform);
  clearSingletonLocks(profileDir);
  return chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 1100 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });
}

/**
 * 外层入口：负责短链预展开 + 缓存命中 + 重试编排。
 * 真正的浏览器抓取流程在 _fetchMetricsOnce 里。
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.retries=0]  内层重试次数（额外尝试次数）。默认 0：
 *   绝大多数生产调用都通过 scripts/parser-core.js 的 fetchWithRetry 重试，
 *   再叠一层只会撞 nginx 60s 超时；CLI 工具/直连场景显式传 1~2。
 */
async function fetchMetricsFromUrl(url, options = {}) {
  const targetUrl = normalizeUrl(url);
  if (!targetUrl) {
    throw new Error("作品链接不能为空");
  }

  // 1. 短链 HEAD 预展开（v.douyin.com / xhslink.com）
  let workingUrl = targetUrl;
  if (/v\.douyin\.com|xhslink\.com/i.test(targetUrl)) {
    try {
      const expanded = await expandShortUrl(targetUrl);
      if (expanded && expanded !== targetUrl) {
        console.log(`[metricsFetcher] 短链展开: ${targetUrl} -> ${expanded}`);
        workingUrl = expanded;
      }
    } catch (err) {
      console.warn(`[metricsFetcher] 短链展开失败，沿用原链接: ${err?.message || err}`);
    }
  }

  const platform = detectPlatform(workingUrl);
  if (!platform) {
    throw new Error("暂时只支持小红书和抖音作品链接");
  }

  // 2. 结果缓存（5 分钟 TTL）
  const cacheKey = canonicalCacheKey(platform, workingUrl);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    console.log(`[metricsFetcher] 缓存命中: key=${cacheKey}`);
    return { ...cached, fromCache: true };
  }

  // 3. 在平台锁内执行抓取和重试
  //    同一平台串行化，避免多个请求同时启动浏览器导致 profile 目录锁冲突
  return withPlatformLock(platform, async () => {
    // 双重检查缓存（可能其他任务在等锁时已经写入了）
    const doubleCheck = getCachedResult(cacheKey);
    if (doubleCheck) {
      console.log(`[metricsFetcher] 缓存命中(双重检查): key=${cacheKey}`);
      return { ...doubleCheck, fromCache: true };
    }

    const retries = Math.max(0, Number(options.retries ?? 0));
    const maxAttempts = retries + 1;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await _fetchMetricsOnce(workingUrl, platform);
        setCachedResult(cacheKey, result);
        return result;
      } catch (err) {
        lastErr = err;
        if (err instanceof LoginWallError) throw err;
        if (attempt < maxAttempts) {
          console.warn(`[metricsFetcher] 第 ${attempt}/${maxAttempts} 次抓取失败，准备重试: ${err?.message || err}`);
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    throw lastErr;
  });
}

async function _fetchMetricsOnce(targetUrl, platform) {
  const context = await getContext(platform);
  let page;
  const t0 = Date.now();
  let contextReleased = false;
  try {
    page = await context.newPage();

    // ── 资源拦截：仅小红书启用（抖音 SPA 需要完整 JS 执行） ──
    if (platform !== "抖音") {
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(type)) { route.abort(); } else { route.continue(); }
      });
    }

    // ── 抖音：提取 videoId 用于日志，不修改 URL ──
    let targetVideoId = null;
    if (platform === "抖音") {
      targetVideoId = targetUrl.match(/modal_id=(\d+)/)?.[1] || targetUrl.match(/\/video\/(\d+)/)?.[1] || null;
      console.log(`[metricsFetcher] 抖音模式: targetVideoId=${targetVideoId}`);
    }

    // ── 小红书：提取目标笔记 ID，用于匹配 SSR 数据 ──
    let targetNoteId = null;
    if (platform === "小红书") {
      targetNoteId = extractXiaohongshuNoteId(targetUrl);
      console.log(`[metricsFetcher] 小红书目标笔记ID: ${targetNoteId || "unknown"}`);
    }

    // ── Tier 1：在 goto 之前注册详情 API 监听，避免 race ──
    //   抖音 /aweme/v1/web/aweme/detail/  → aweme_detail
    //   小红书 /api/sns/web/v{1,2}/feed   → data.items[0].note_card
    const apiDetailPromise = (platform === "抖音"
      ? page.waitForResponse(
          (r) => /\/aweme\/v1\/web\/aweme\/(?:detail|post)\//.test(r.url()) && r.status() === 200,
          { timeout: 8000 },
        ).then(async (r) => {
          try {
            const j = await r.json();
            // /detail/ → j.aweme_detail
            if (j?.aweme_detail) return j.aweme_detail;
            // /post/ → j.aweme_list[0]（笔记页第一项是目标视频）
            if (j?.aweme_list?.length > 0) return j.aweme_list[0];
            return null;
          } catch { return null; }
        })
      : page.waitForResponse(
          (r) => /\/api\/sns\/web\/v\d+\/feed/.test(r.url()) && r.status() === 200,
          { timeout: 5000 },
        ).then(async (r) => {
          try {
            const j = await r.json();
            return j?.data?.items?.[0]?.note_card || null;
          } catch { return null; }
        })
    ).catch(() => null);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    const tLoad = Date.now();

    // ── 等待 API 响应：最多额外等 2.5s，命中后即跳过 networkidle 长等 ──
    const apiDetail = await Promise.race([
      apiDetailPromise,
      new Promise((r) => setTimeout(() => r(null), 2500)),
    ]);
    if (apiDetail) {
      console.log(`[metricsFetcher] ${platform} API 详情命中（耗时 ${Date.now() - tLoad}ms）`);
    }

    // ── 优化 #2：抖音笔记页，API 未命中时从 HTML 提前提取 RSC 数据 ──
    let rscDetail = null;
    if (!apiDetail && platform === "抖音") {
      try {
        const html = await page.content();
        rscDetail = extractDouyinDetailFromRscHtml(html);
        if (rscDetail) {
          console.log(`[metricsFetcher] 抖音 RSC 提前命中（耗时 ${Date.now() - tLoad}ms）`);
        }
      } catch (err) {
        console.warn(`[metricsFetcher] 抖音 RSC 提前提取失败: ${err?.message || err}`);
      }
    }

    // 等待策略：API/RSC 命中后无需等 networkidle；未命中沿用原策略
    const hasDetail = !!(apiDetail || rscDetail);
    if (platform === "抖音") {
      if (!hasDetail) {
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        await page.waitForTimeout(200);
      }
    } else {
      if (!apiDetail) {
        await page.waitForLoadState("networkidle", { timeout: 800 }).catch(() => {});
      }
      await page.waitForTimeout(200);
    }

    // 先关闭登录/引导浮层，避免 title/bodyText 被浮层文案污染导致误判
    await dismissObstacles(page, platform).catch(() => {});
    const obstacleCheck = await detectObstacleOverlay(page, platform);
    // API 已拿到详情：即使有覆盖层也认为页面有效
    if (obstacleCheck.detected && !apiDetail) {
      contextReleased = true;
      releaseContext(platform);
      throw new LoginWallError(`当前打开的是${platform}登录页/登录弹窗/新手引导，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`);
    }

    const pageTitle = await page.title().catch(() => "");

    const payload = platform === "小红书"
      ? await scrapeXiaohongshu(page, targetNoteId, apiDetail)
      : await scrapeDouyin(page, apiDetail, rscDetail);

    // 小红书：校验目标笔记是否在 SSR 中；如果不在，说明当前页不是目标笔记详情。
    // 但若 API 已拿到 note_card，认为数据有效。
    if (platform === "小红书" && targetNoteId) {
      const notePresent = await isXiaohongshuNotePresent(page, targetNoteId);
      console.log(`[metricsFetcher] 小红书目标笔记存在性: noteId=${targetNoteId}, present=${notePresent}, apiDetail=${apiDetail ? "yes" : "no"}`);
      if (!notePresent && !apiDetail) {
        contextReleased = true;
        releaseContext(platform);
        throw new LoginWallError(`当前打开的是小红书登录页/未找到目标笔记，请先在"链接测试"里点"打开小红书登录浏览器"完成一次登录。`);
      }
    }

    // 抖音：DOM 层抓到指标 / API 命中 → 页面有真实内容，不是登录墙。
    const hasDouyinData = platform === "抖音"
      && (!!apiDetail || payload.likes > 0 || payload.comments > 0 || payload.favorites > 0 || payload.shares > 0);

    const shouldCheckLoginWall = platform !== "小红书" || !targetNoteId;
    if (shouldCheckLoginWall && !hasDouyinData && looksLikeLoginWall(platform, payload.bodyText, pageTitle)) {
      contextReleased = true;
      releaseContext(platform);
      throw new LoginWallError(`当前打开的是${platform}登录页，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`);
    }

    const normalizedTitle = String((payload && payload.title) || pageTitle || "")
      .replace(/\s*-\s*小红书\s*$/, "")
      .replace(/\s*-\s*抖音\s*$/, "")
      .trim();

    let coverImageUrl = "";
    let coverThumbUrl = "";
    try {
      const cover =
        platform === "小红书"
          ? await capturePostCover(page, platform, targetNoteId)
          : await capturePostCover(page, platform);
      if (cover) {
        coverImageUrl = cover.coverImageUrl;
        coverThumbUrl = cover.coverThumbUrl;
      } else {
        console.warn(`[metricsFetcher] ${platform} 封面截图为空（capturePostCover 返回 null）`);
      }
    } catch (coverErr) {
      console.warn(`[metricsFetcher] capturePostCover failed: ${coverErr?.message || coverErr}`);
    }

    const result = {
      platform,
      title: normalizedTitle,
      authorName: payload?.authorName || "",
      authorId: payload?.authorId || "",
      likes: Number(payload.likes || 0),
      comments: Number(payload.comments || 0),
      favorites: Number(payload.favorites || 0),
      shares: Number(payload.shares || 0),
      coverImageUrl,
      coverThumbUrl,
      publishedAt: payload?.publishDate || "",
      metricsUpdatedAt: new Date().toISOString()
    };
    console.log(`[metricsFetcher] ${platform} 抓取完成: ${Date.now() - t0}ms (加载${tLoad - t0}ms) 赞${result.likes} 评${result.comments} 藏${result.favorites} 分享${result.shares}`);
    return result;
  } catch (err) {
    // 非登录墙错误：context 可能已损坏，从池中移除让外层重试时冷启动
    if (!(err instanceof LoginWallError) && !contextReleased) {
      contextReleased = true;
      releaseContext(platform);
    }
    throw err;
  } finally {
    // 关闭本次抓取打开的标签页。
    // contextReleased=true 时整个浏览器已被 releaseContext 关闭，无需再关 page。
    if (!contextReleased) {
      if (page) {
        await page.close().catch(() => {});
      }
      // 兜底：关闭 context 中除首页外的所有残留标签（防止 page.close 失败时泄漏）
      try {
        const pages = context.pages();
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close().catch(() => {});
        }
      } catch {}
    }
  }
}

// ── 通用浮层/蒙层检测与关闭 ───────────────────────────────────
// 用于在截取封面前去掉登录弹窗、新手引导、操作提示等遮挡浮层。

function getOverlayKeywords(platform) {
  const base = platform === "小红书"
    ? ["登录", "扫码", "立即登录", "手机号登录", "打开小红书App查看", "登录后推荐", "登录后评论"]
    : ["登录", "扫码登录", "验证码登录", "登录后", "请登录"];
  // 抖音新手引导 / 操作提示
  const douyinObstacles = platform === "抖音"
    ? ["我知道了", "新手引导", "滚动鼠标", "键盘上下键", "点击屏幕上的", "切换视频", "更多推荐视频"]
    : [];
  return [...base, ...douyinObstacles];
}

async function detectObstacleOverlay(page, platform) {
  const keywords = getOverlayKeywords(platform);
  const result = await page
    .evaluate((words) => {
      const hasWord = (el, list) => {
        const matched = [];
        for (const w of words) {
          if (el.textContent.includes(w)) matched.push(w);
        }
        return matched;
      };
      const isOverlay = (el) => {
        const style = window.getComputedStyle(el);
        return (
          style.position === "fixed" ||
          style.position === "sticky" ||
          Number(style.zIndex) > 100 ||
          style.pointerEvents !== "none"
        );
      };
      const nodes = document.querySelectorAll('div, section, dialog, [role="dialog"]');
      const matchedWords = new Set();
      let count = 0;
      for (const el of nodes) {
        if (!isOverlay(el)) continue;
        const foundWords = hasWord(el, words);
        if (foundWords.length > 0) {
          count += 1;
          foundWords.forEach((w) => matchedWords.add(w));
        }
      }
      return {
        detected: count > 0,
        matchedWords: Array.from(matchedWords),
        count,
      };
    }, keywords)
    .catch((err) => {
      console.warn(`[metricsFetcher] detectObstacleOverlay evaluate failed: ${err?.message || err}`);
      return { detected: false, matchedWords: [], count: 0 };
    });

  if (result.detected) {
    console.log(
      `[metricsFetcher] 检测到${platform}遮挡浮层: count=${result.count}, keywords=[${result.matchedWords.join(", ")}]`,
    );
  } else {
    console.log(`[metricsFetcher] 未检测到${platform}遮挡浮层`);
  }
  return result;
}

async function dismissObstacles(page, platform) {
  const keywords = getOverlayKeywords(platform);
  console.log(`[metricsFetcher] dismissObstacles start: platform=${platform}, keywords=[${keywords.join(", ")}]`);

  // 1) 尝试常规关闭方式（登录弹窗 + 新手引导共用）
  await page.keyboard.press("Escape").catch(() => {});
  const closeSelectors = [
    ".mask",
    ".close",
    '[class*="close"]',
    '[class*="cancel"]',
    'button:has-text("关闭")',
    'button:has-text("取消")',
    'button:has-text("以后再说")',
    'button:has-text("我知道了")',
  ];
  let selectorClickCount = 0;
  for (const sel of closeSelectors) {
    try {
      await page.locator(sel).first().click({ timeout: 300, force: true });
      selectorClickCount += 1;
      console.log(`[metricsFetcher] dismissObstacles clicked selector: ${sel}`);
    } catch {}
  }
  console.log(`[metricsFetcher] dismissObstacles selector clicks: ${selectorClickCount}/${closeSelectors.length}`);

  // 2) 暴力移除仍存在的浮层与常见蒙层
  let removedByKeywordCount = 0;
  await page.evaluate((words) => {
    const hasWord = (el) => words.some((w) => el.textContent.includes(w));
    const overlays = [];
    const collect = (node) => {
      if (node.nodeType !== 1) return;
      const style = window.getComputedStyle(node);
      if (
        (style.position === "fixed" || style.position === "sticky" || Number(style.zIndex) > 100) &&
        hasWord(node)
      ) {
        overlays.push(node);
        return;
      }
      for (const c of node.children) collect(c);
    };
    collect(document.body);

    overlays.forEach((el) => {
      let target = el;
      for (let i = 0; i < 2 && target && target.tagName !== "BODY"; i++) {
        target = target.parentElement;
      }
      if (target && target.tagName !== "BODY") {
        target.remove();
      } else {
        el.remove();
      }
    });

    document
      .querySelectorAll('.mask, .modal-mask, .overlay, [class*="backdrop"], [class*="mask"]')
      .forEach((el) => el.remove());

    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.position = "static";

    return overlays.length;
  }, keywords).then((count) => {
    removedByKeywordCount = count || 0;
    console.log(`[metricsFetcher] dismissObstacles removed keyword overlays: ${removedByKeywordCount}`);
  }).catch((err) => {
    console.warn(`[metricsFetcher] dismissObstacles keyword remove failed: ${err?.message || err}`);
  });

  // 3) 对抖音特有的新手引导蒙层（通常是一个全屏半透明层 + 中央手指图标），暴力移除
  let removedDouyinGuideCount = 0;
  if (platform === "抖音") {
    await page.evaluate(() => {
      let count = 0;
      const all = document.querySelectorAll('div, section');
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.position !== 'fixed' && style.position !== 'absolute' && style.position !== 'sticky') continue;
        const rect = el.getBoundingClientRect();
        // 全屏或接近全屏的覆盖层，且包含引导文案
        if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) {
          const text = el.textContent || '';
          if (/滚动[\s\S]*?鼠标|键盘[\s\S]*?上下键|点击屏幕|切换视频|更多推荐|我知道了/i.test(text)) {
            el.remove();
            count += 1;
          }
        }
      }
      return count;
    }).then((count) => {
      removedDouyinGuideCount = count || 0;
      console.log(`[metricsFetcher] dismissObstacles removed douyin guide overlays: ${removedDouyinGuideCount}`);
    }).catch((err) => {
      console.warn(`[metricsFetcher] dismissObstacles douyin guide remove failed: ${err?.message || err}`);
    });
  }

  console.log(`[metricsFetcher] dismissObstacles done: selectorClicks=${selectorClickCount}, keywordRemoved=${removedByKeywordCount}, douyinGuideRemoved=${removedDouyinGuideCount}`);
}

// ── 语义化封面提取（从平台 SSR 数据拿真实封面 URL） ─────────────

function extractXiaohongshuNoteId(url) {
  const value = String(url || "");
  const longMatch = value.match(/\/explore\/([a-zA-Z0-9]+)/);
  if (longMatch) return longMatch[1];
  const legacyMatch = value.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
  if (legacyMatch) return legacyMatch[1];
  return "";
}

async function isXiaohongshuNotePresent(page, noteId) {
  if (!noteId) return true;
  return page
    .evaluate((id) => {
      const root = window.__INITIAL_STATE__ || window.__initialState__;
      const map = root?.note?.noteDetailMap;
      if (!map) return false;
      if (map[id]) return true;
      return Object.values(map).some((item) => {
        const note = item?.note || item?.data?.note || item;
        return String(note?.id || note?.note_id || note?.noteId || "").trim() === id;
      });
    }, noteId)
    .catch(() => false);
}

async function extractXiaohongshuCoverUrl(page, preferredNoteId) {
  const noteId = preferredNoteId || extractXiaohongshuNoteId(page.url());
  console.log(`[metricsFetcher] extractXiaohongshuCoverUrl start: noteId=${noteId || "unknown"}`);

  const result = await page
    .evaluate((targetId) => {
      const add = (url, list) => {
        if (typeof url === "string" && /^https?:\/\//.test(url)) list.push(url);
      };

      const collectNoteFields = (note) => {
        const urls = [];
        if (!note || typeof note !== "object") return urls;
        // 优先取专用 cover 字段
        add(note.cover, urls);
        add(note.coverUrl, urls);
        // 再取 imageList 第一张（纯图文笔记）
        if (Array.isArray(note.imageList)) {
          note.imageList.forEach((img) => {
            add(img?.url, urls);
            add(img?.urlDefault, urls);
            add(img?.infoList?.[0]?.url, urls);
          });
        }
        if (Array.isArray(note.images)) {
          note.images.forEach((img) => add(img?.url, urls));
        }
        // 视频笔记兜底
        add(note.video?.url, urls);
        add(note.videoUrl, urls);

        const card = note.noteCard || note;
        if (Array.isArray(card.imageList)) {
          card.imageList.forEach((img) => add(img?.url, urls));
        }
        add(card.cover, urls);
        return urls;
      };

      const root = window.__INITIAL_STATE__ || window.__initialState__;
      const map = root?.note?.noteDetailMap;
      const debug = {
        targetId,
        mapKeys: map ? Object.keys(map).slice(0, 10) : [],
        directHit: false,
        idMatchHit: null,
        source: "none",
      };

      // 1) 直接按 key 匹配
      if (targetId && map?.[targetId]) {
        const note = map[targetId].note || map[targetId].data?.note || map[targetId];
        const urls = collectNoteFields(note);
        if (urls.length > 0) {
          debug.directHit = true;
          debug.source = "noteDetailMap-direct";
          return { urls, debug, title: String(note?.title || note?.display_title || "").slice(0, 60) };
        }
      }

      // 2) 按内部 note.id / note_id 匹配
      if (targetId && map) {
        for (const [key, item] of Object.entries(map)) {
          const note = item?.note || item?.data?.note || item;
          const id = String(note?.id || note?.note_id || note?.noteId || "").trim();
          if (id && id === targetId) {
            const urls = collectNoteFields(note);
            if (urls.length > 0) {
              debug.idMatchHit = key;
              debug.source = "noteDetailMap-id-match";
              return { urls, debug, title: String(note?.title || note?.display_title || "").slice(0, 60) };
            }
          }
        }
      }

      // 3) 兜底：遍历全部
      const fallback = [];
      if (map) {
        Object.values(map).forEach((item) => fallback.push(...collectNoteFields(item?.note || item?.data?.note || item)));
      }
      if (root?.noteData?.data?.noteData) fallback.push(...collectNoteFields(root.noteData.data.noteData));
      if (root?.noteData?.noteData) fallback.push(...collectNoteFields(root.noteData.noteData));
      if (root?.data?.noteData?.data?.noteData) fallback.push(...collectNoteFields(root.data.noteData.data.noteData));
      if (root?.noteCard) fallback.push(...collectNoteFields(root.noteCard));
      if (fallback.length > 0) {
        debug.source = "fallback";
        return { urls: fallback, debug, title: "" };
      }

      // 4) meta 兜底
      const meta = document.querySelector('meta[property="og:image"]');
      const metaUrl = meta?.getAttribute("content");
      if (metaUrl) {
        debug.source = "meta";
        return { urls: [metaUrl], debug, title: "" };
      }

      return { urls: [], debug, title: "" };
    })
    .catch((err) => {
      console.warn(`[metricsFetcher] extractXiaohongshuCoverUrl failed: ${err?.message || err}`);
      return null;
    });

  if (!result) return null;

  const { urls, debug, title } = result;
  console.log(
    `[metricsFetcher] 小红书封面解析: source=${debug.source}, directHit=${debug.directHit}, idMatchHit=${debug.idMatchHit || "null"}, mapKeys=[${debug.mapKeys.join(", ")}], title=${title || "empty"}`,
  );
  if (urls.length > 0) {
    console.log(`[metricsFetcher] 小红书语义封面候选: count=${urls.length}, first=${urls[0]}`);
    return urls[0];
  }
  console.log(`[metricsFetcher] 小红书未找到语义封面 URL`);
  return null;
}

async function extractDouyinCoverUrl(page) {
  console.log(`[metricsFetcher] extractDouyinCoverUrl start`);

  // ── 优先：RSC flight data（图文/笔记页 awemeType=68 的封面在 detail.images） ──
  const html = await page.content().catch(() => "");
  const rscDetail = html ? extractDouyinDetailFromRscHtml(html) : null;
  if (rscDetail) {
    const rscMetrics = extractDouyinFromDetail(rscDetail);
    if (rscMetrics?.coverImageUrl) {
      console.log(`[metricsFetcher] 抖音 RSC 封面命中: ${rscMetrics.coverImageUrl.slice(0, 120)}`);
      return rscMetrics.coverImageUrl;
    }
  }

  const fromRender = await page
    .evaluate(() => {
      try {
        const el = document.querySelector('script#RENDER_DATA');
        if (!el) return { hasScript: false, candidates: [] };
        let txt = el.textContent.trim();
        try { txt = decodeURIComponent(txt); } catch {}
        if (txt.startsWith("%")) {
          try { txt = decodeURIComponent(txt); } catch {}
        }
        const data = JSON.parse(txt);
        const candidates = [];
        const walk = (obj, depth) => {
          if (!obj || typeof obj !== "object" || depth > 12) return;
          if (obj.video && typeof obj.video === "object") {
            const v = obj.video;
            const pick = (o) =>
              Array.isArray(o?.url_list)
                ? o.url_list.find((u) => typeof u === "string" && /^https?:\/\//.test(u))
                : null;
            const url =
              pick(v.cover) || pick(v.dynamic_cover) || pick(v.origin_cover) || pick(v.ai_dynamic_cover);
            if (url) {
              candidates.push({
                url,
                awemeId: obj.aweme_id || obj.awemeId || obj.video?.aweme_id || obj.video?.awemeId,
                desc: String(obj.desc || obj.title || "").slice(0, 60),
              });
            }
          }
          for (const val of Object.values(obj)) walk(val, depth + 1);
        };
        walk(data, 0);
        return { hasScript: true, candidates };
      } catch (err) {
        return { hasScript: true, candidates: [], error: String(err?.message || err) };
      }
    })
    .catch((err) => {
      console.warn(`[metricsFetcher] extractDouyinCoverUrl RENDER_DATA evaluate failed: ${err?.message || err}`);
      return { hasScript: false, candidates: [] };
    });

  console.log(
    `[metricsFetcher] 抖音 RENDER_DATA: hasScript=${fromRender.hasScript}, candidates=${fromRender.candidates.length}${fromRender.error ? ", error=" + fromRender.error : ""}`,
  );
  if (fromRender.candidates.length > 0) {
    fromRender.candidates.slice(0, 3).forEach((c, i) => {
      console.log(`[metricsFetcher] 抖音封面候选${i}: url=${c.url}, awemeId=${c.awemeId || "unknown"}, desc=${c.desc || ""}`);
    });
    return fromRender.candidates[0].url;
  }

  const fromDom = await page
    .evaluate(() => {
      const v = document.querySelector("video");
      if (v?.poster) return v.poster;
      const img = document.querySelector("#sliderVideo img, #douyin-right-container img");
      return img?.src || null;
    })
    .catch((err) => {
      console.warn(`[metricsFetcher] extractDouyinCoverUrl DOM fallback failed: ${err?.message || err}`);
      return null;
    });

  if (fromDom) {
    console.log(`[metricsFetcher] 抖音 DOM 兜底封面: ${fromDom}`);
    return fromDom;
  }

  console.log(`[metricsFetcher] 抖音未找到语义封面 URL`);
  return null;
}

/**
 * 抖音会把图文笔记转成视频播放，其 metadata 封面（cover/originCover）经常是一张纯色/占位图。
 * 本函数在页面内暂停视频并 seek 到开头，对 video 元素截图，拿到真实首帧作为封面。
 */
async function captureDouyinVideoFirstFrame(page) {
  try {
    const video = page.locator("video").first();
    const count = await video.count().catch(() => 0);
    if (!count) {
      console.log(`[metricsFetcher] 页面无 video 元素，跳过首帧截图`);
      return null;
    }

    await video.evaluate((el) => {
      try {
        el.pause();
        if (el.currentTime > 0) el.currentTime = 0;
        el.style.objectFit = "contain";
      } catch {}
    });
    await page.waitForTimeout(500);

    const buf = await video.screenshot({ type: "jpeg", quality: 92, timeout: 8000 });
    console.log(`[metricsFetcher] 抖音视频首帧截图: ${buf?.length || 0} bytes`);
    return buf || null;
  } catch (err) {
    console.warn(`[metricsFetcher] 抖音视频首帧截图失败: ${err?.message || err}`);
    return null;
  }
}

async function fetchCoverImage(page, url) {
  if (!url) {
    console.log(`[metricsFetcher] fetchCoverImage skipped: url empty`);
    return null;
  }
  try {
    console.log(`[metricsFetcher] fetchCoverImage start: ${url.slice(0, 120)}`);
    // page.request 与页面共享 Cookie，且不走 page.route 拦截，能绕过小红书的图片资源屏蔽
    const resp = await page.request.get(url, { headers: { referer: page.url() } });
    const status = resp.status();
    const contentType = resp.headers()["content-type"] || "unknown";
    if (!resp.ok()) {
      console.warn(`[metricsFetcher] fetchCoverImage HTTP ${status}, content-type=${contentType}, url=${url.slice(0, 120)}`);
      return null;
    }
    const buf = await resp.body();
    console.log(`[metricsFetcher] fetchCoverImage OK: status=${status}, content-type=${contentType}, size=${buf?.length || 0}`);
    return buf;
  } catch (err) {
    console.warn(`[metricsFetcher] fetchCoverImage failed: ${err?.message || err}, url=${url.slice(0, 120)}`);
    return null;
  }
}

async function validateCoverBuffer(buf) {
  if (!buf || buf.length < 5 * 1024) {
    console.warn(`[metricsFetcher] validateCoverBuffer rejected: size=${buf?.length || 0} < 5KB`);
    return false;
  }
  try {
    const meta = await sharp(buf).metadata();
    if (!meta || meta.width < 200 || meta.height < 200) {
      console.warn(`[metricsFetcher] validateCoverBuffer rejected: ${meta?.width || 0}x${meta?.height || 0}`);
      return false;
    }
    console.log(`[metricsFetcher] validateCoverBuffer OK: ${meta.width}x${meta.height}, size=${buf.length}`);
    return true;
  } catch (err) {
    console.warn(`[metricsFetcher] validateCoverBuffer sharp failed: ${err?.message || err}`);
    return false;
  }
}

/**
 * 暂停页面上所有正在播放的视频，避免视口截图时抓到黑屏或动态模糊帧。
 */
async function pauseAllVideos(page) {
  try {
    const result = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      let pausedCount = 0;
      videos.forEach((v) => {
        try {
          if (!v.paused) {
            v.pause();
            pausedCount += 1;
          }
          // 把进度拉回开头，防止暂停在黑屏或片尾
          if (v.currentTime > 0.1) {
            v.currentTime = 0;
          }
        } catch (e) {
          // 某些视频元素可能禁止 seek，忽略
        }
      });
      return { total: videos.length, paused: pausedCount };
    });
    console.log(`[metricsFetcher] pauseAllVideos: total=${result.total}, paused=${result.paused}`);
    if (result.total > 0) {
      await page.waitForTimeout(300);
    }
  } catch (err) {
    console.warn(`[metricsFetcher] pauseAllVideos failed: ${err?.message || err}`);
  }
}

/**
 * 截取/提取作品封面。
 *
 * 策略（按优先级）：
 *   1. 先关闭/移除登录弹窗等遮挡浮层；
 *   2. 暂停页面视频，避免截图模糊/黑屏；
 *   3. 从平台 SSR 数据提取真实封面 URL 并下载；
 *      小红书 __INITIAL_STATE__ / 抖音 RSC flight data + RENDER_DATA
 *   4. 抖音：视频首帧截图（图文笔记常被转成视频，metadata 封面可能是纯色占位图）；
 *   5. 兜底：视口截图。
 */
async function capturePostCover(page, platform, preferredNoteId) {
  console.log(`[metricsFetcher] capturePostCover start: platform=${platform}, noteId=${preferredNoteId || "unknown"}`);
  try {
    // 1. 去掉登录弹窗/新手引导/遮挡蒙层
    console.log(`[metricsFetcher] capturePostCover step 1: dismissObstacles`);
    await dismissObstacles(page, platform);

    // 2. 暂停视频（兜底截图时避免动态模糊/黑屏）
    console.log(`[metricsFetcher] capturePostCover step 2: pauseAllVideos`);
    await pauseAllVideos(page);

    // 3. 优先拿语义化封面原图
    console.log(`[metricsFetcher] capturePostCover step 3: extract semantic cover url`);
    const semanticUrl =
      platform === "小红书"
        ? await extractXiaohongshuCoverUrl(page, preferredNoteId)
        : await extractDouyinCoverUrl(page);
    console.log(`[metricsFetcher] capturePostCover semanticUrl: ${semanticUrl ? semanticUrl.slice(0, 120) : "null"}`);
    if (semanticUrl) {
      const buf = await fetchCoverImage(page, semanticUrl);
      if (buf && (await validateCoverBuffer(buf))) {
        const cover = await writeCoverJpeg(buf, "semantic");
        console.log(`[metricsFetcher] 语义封面写入: ${cover?.coverImageUrl || "null"}`);
        return cover;
      }
      console.warn(`[metricsFetcher] capturePostCover semantic cover invalid, fallback to video first frame`);
    } else {
      console.log(`[metricsFetcher] capturePostCover no semantic url, fallback to video first frame`);
    }

    // 4. 抖音兜底：视频首帧截图（图文笔记常被转成视频，metadata 封面可能是纯色占位图）
    if (platform === "抖音") {
      console.log(`[metricsFetcher] capturePostCover step 4: capture video first frame`);
      const frameBuf = await captureDouyinVideoFirstFrame(page);
      if (frameBuf && (await validateCoverBuffer(frameBuf))) {
        const cover = await writeCoverJpeg(frameBuf, "video-frame");
        console.log(`[metricsFetcher] 抖音视频首帧封面写入: ${cover?.coverImageUrl || "null"}`);
        return cover;
      }
      console.warn(`[metricsFetcher] capturePostCover video first frame invalid, fallback to viewport screenshot`);
    }

    // 5. 兜底：视口截图
    console.log(`[metricsFetcher] capturePostCover step 5: viewport screenshot`);
    // 等待懒加载图片展开后再截图（小红书/抖音常见 loading="lazy"）
    try {
      await page.evaluate(() => {
        document.querySelectorAll('img[loading="lazy"], img[data-src], img[loading]').forEach((img) => {
          if (img.dataset.src) img.src = img.dataset.src;
          img.loading = 'eager';
          if (img.complete === false) img.setAttribute('loading', 'eager');
        });
      });
      await page.waitForTimeout(300);
    } catch {}
    const useLocator = process.env.PLAYWRIGHT_HEADLESS !== "0" && platform !== "抖音";
    let buf;
    if (useLocator) {
      buf = await page.locator("body").screenshot({ type: "png", timeout: 8000 });
    } else {
      buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 1080 }, timeout: 10000 });
    }
    console.log(`[metricsFetcher] 截图 buffer: ${buf ? buf.length : "null"} bytes`);
    if (buf && (await validateCoverBuffer(buf))) {
      const cover = await writeCoverJpeg(buf, "viewport");
      console.log(`[metricsFetcher] 视口封面写入: ${cover?.coverImageUrl || "null"}`);
      return cover;
    }
    console.warn(`[metricsFetcher] 截图 buffer 无效(${buf?.length || 0} bytes)，跳过封面`);
  } catch (err) {
    console.warn(`[metricsFetcher] capturePostCover failed: ${err?.message || err}`);
  }
  console.log(`[metricsFetcher] capturePostCover end: no cover produced`);
  return null;
}

/**
 * 用 Playwright 的 page 上下文 fetch 一张远程图片，拿到原始 Buffer。
 * 不用 node fetch：能复用登录态 Cookie，命中平台防盗链。
 */
async function fetchImageBuffer(url, page) {
  try {
    const data = await page.evaluate(async (u) => {
      const resp = await fetch(u, { credentials: "include" });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const ab = await blob.arrayBuffer();
      return { ok: true, bytes: Array.from(new Uint8Array(ab)), type: blob.type };
    }, url);
    if (!data?.ok) return null;
    return Buffer.from(data.bytes);
  } catch {
    return null;
  }
}

/**
 * 把任意来源的 Buffer 用 sharp 缩放为 ≤ COVER_THUMB_MAX_WIDTH 的 JPEG，写到 uploads/post-covers/，
 * 返回可访问的 URL（前端 ImageUploadField 提交时直接当 coverImageUrl + coverThumbUrl）。
 */
async function writeCoverJpeg(inputBuf, source) {
  if (!inputBuf || !inputBuf.length) return null;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const filename = `${stamp}.jpg`;
  const filepath = path.join(COVERS_DIR, filename);
  await sharp(inputBuf)
    .rotate() // 处理 EXIF 方向
    .resize({ width: COVER_THUMB_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: COVER_THUMB_QUALITY, mozjpeg: true })
    .toFile(filepath);
  const url = `/uploads/post-covers/${filename}`;
  return {
    coverImageUrl: url,
    coverThumbUrl: url,
    source,
  };
}

module.exports = {
  detectPlatform,
  fetchMetricsFromUrl,
  openLoginBrowser,
  closeLoginBrowser,
  getLoginStatus,
  getProfileDir,
  getPlatformHome,
  cleanupAllContexts,
};
