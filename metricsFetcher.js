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
// 屏蔽图片/字体/CSS/媒体/WebSocket，只放行 document/script/xhr/fetch。
// SSR 数据（__INITIAL_STATE__ / RENDER_DATA）在 HTML 原文里，不需要渲染完整页面。
const BLOCKED_RESOURCE_TYPES = new Set(["image", "stylesheet", "font", "media", "websocket"]);

// ── 优化：浏览器上下文池 ────────────────────────────────────────
// 复用 persistent context，避免每次请求冷启动 Chromium（省 1-3s）。
// 全局锁保证同一时刻只有一个抓取任务，所以单 context 够用。
const pooledContexts = new Map(); // platform -> BrowserContext

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
  clearSingletonLocks(profileDir);
  console.log(`[metricsFetcher] 创建 ${platform} 浏览器上下文（冷启动）`);
  // 抖音使用有头浏览器（headless: false）绕过反爬检测；
  // 小红书保持无头（headless: true）+ 资源拦截加速。
  const isHeadless = platform !== "抖音";
  // Linux 特有参数：Docker/root 下需要 --no-sandbox；
  // 有头模式需要 --disable-gpu 避免无 GPU 时的渲染问题。
  const linuxArgs = [];
  if (process.platform === "linux") {
    linuxArgs.push("--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage");
  }
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: isHeadless,
    viewport: { width: 1440, height: 1100 },
    args: [
      ...(isHeadless ? ["--disable-remote-fonts"] : []),
      ...linuxArgs,
    ],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  pooledContexts.set(platform, ctx);
  return ctx;
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

async function inferDouyinCountsFromHtml(page, videoId) {
  const html = await page.content().catch(() => "");
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

async function readXiaohongshuInitialState(page) {
  return page.evaluate(() => {
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

async function scrapeXiaohongshu(page) {
  const initialState = await readXiaohongshuInitialState(page);
  const precise = await readXiaohongshuEngageBar(page);
  const htmlFallback = await inferXiaohongshuCountsFromHtml(page);
  const metaTags = await readXiaohongshuMetaTags(page);
  const likes = parseCount(initialState?.likes) ?? parseCount(precise?.likes) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .like-wrapper .count",
    ".engage-bar .interact-container .like-wrapper .count",
    "[class*='like'] [class*='count']",
    "[data-testid*='like'] [class*='count']"
  ]);
  const comments = parseCount(initialState?.comments) ?? parseCount(precise?.comments) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .chat-wrapper .count",
    ".engage-bar .interact-container .chat-wrapper .count",
    "[class*='chat'] [class*='count']",
    "[class*='comment'] [class*='count']"
  ]);
  const favorites = parseCount(initialState?.favorites) ?? parseCount(precise?.favorites) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .collect-wrapper .count",
    ".engage-bar .interact-container .collect-wrapper .count",
    "[class*='collect'] [class*='count']",
    "[class*='favorite'] [class*='count']"
  ]);
  const shares = parseCount(initialState?.shares) ?? parseCount(precise?.shares) ?? await readCountBySelectors(page, [
    ".interactions.engage-bar .interact-container .share-wrapper .count",
    ".engage-bar .interact-container .share-wrapper .count",
    "[class*='share'] [class*='count']",
    "[data-testid*='share'] [class*='count']"
  ]);

  // 标题：INITIAL_STATE > meta og:title > empty
  const title = initialState?.title || metaTags?.title || metaTags?.description || "";
  // 作者：INITIAL_STATE > meta og:author > empty
  const authorName = initialState?.authorName || metaTags?.authorName || "";
  const authorId = initialState?.authorId || "";

  const fallback = await inferCountsFromBody(page);
  return {
    bodyText: fallback.text,
    title,
    authorName,
    authorId,
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

async function scrapeDouyin(page) {
  const currentUrl = page.url();
  const videoId = extractDouyinVideoId(currentUrl);
  console.log(`[metricsFetcher] 抖音 scrapeDouyin: url=${currentUrl}, videoId=${videoId || '未提取'}`);

  // ── Layer 0: HTML 正则，按 videoId 精确定位 ──
  const htmlFallback = await inferDouyinCountsFromHtml(page, videoId);

  // ── Layer 2: DOM 扫描 ──
  // 模拟 hover 让 tooltip 出来（部分数字可能在 tooltip 里）
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
  const xpathCounts = await page.evaluate(() => {
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
  const interactiveCounts = await page.evaluate(() => {
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

  const fallback = await inferCountsFromBody(page);

  // 优先级：HTML 正则（按 videoId 定位） > XPath > DOM 扫描 > body text
  const sources = { likes: "", comments: "", favorites: "", shares: "" };
  const get = (k) => {
    if (htmlFallback[k] != null) { sources[k] = "html-regex"; return htmlFallback[k]; }
    if (xpathCounts?.[k]) { sources[k] = "xpath"; return xpathCounts[k]; }
    if (interactiveCounts?.[k]) { sources[k] = "dom-scan"; return interactiveCounts[k]; }
    if (fallback[k]) { sources[k] = "body-text"; return fallback[k]; }
    sources[k] = "default(0)";
    return 0;
  };
  const result = {
    bodyText: fallback.text,
    likes: get("likes"),
    comments: get("comments"),
    favorites: get("favorites"),
    shares: get("shares"),
  };
  console.log(`[metricsFetcher] 抖音 最终数据来源: ${JSON.stringify(sources)}`);
  console.log(`[metricsFetcher] 抖音 HTML层: 赞${htmlFallback.likes} 评${htmlFallback.comments} 藏${htmlFallback.favorites} 分享${htmlFallback.shares}`);
  console.log(`[metricsFetcher] 抖音 XPath层: 赞${xpathCounts?.likes ?? 'null'} 评${xpathCounts?.comments ?? 'null'} 藏${xpathCounts?.favorites ?? 'null'} 分享${xpathCounts?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 DOM层:  赞${interactiveCounts?.likes ?? 'null'} 评${interactiveCounts?.comments ?? 'null'} 藏${interactiveCounts?.favorites ?? 'null'} 分享${interactiveCounts?.shares ?? 'null'}`);
  console.log(`[metricsFetcher] 抖音 body层: 赞${fallback.likes} 评${fallback.comments} 藏${fallback.favorites} 分享${fallback.shares}`);
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

async function openLoginBrowser(platform) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }

  if (loginContexts.has(platform)) {
    const context = loginContexts.get(platform);
    const existing = context.pages()[0] || (await context.newPage());
    await existing.bringToFront().catch(() => {});
    await existing.goto(getPlatformHome(platform), { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }).catch(() => {});
    return { ok: true, platform };
  }

  const profileDir = getProfileDir(platform);
  clearSingletonLocks(profileDir);

  const linuxArgs = process.platform === "linux"
    ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
    : [];
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 980 },
    args: linuxArgs,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  });

  context.on("close", () => {
    if (loginContexts.get(platform) === context) {
      loginContexts.delete(platform);
    }
  });

  loginContexts.set(platform, context);
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(getPlatformHome(platform), { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }).catch(() => {});
  return { ok: true, platform };
}

/**
 * 关闭已打开的登录浏览器（释放 GUI 资源 + context）。
 * 没有打开的 context 时返回 ok=false（不算错误）。
 */
async function closeLoginBrowser(platform) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }
  const context = loginContexts.get(platform);
  if (!context) {
    return { ok: false, platform, message: "该平台未打开登录浏览器" };
  }
  await context.close().catch(() => {});
  // context.on("close") 已删除 loginContexts 里的引用
  return { ok: true, platform };
}

/**
 * 查询某平台 profile 是否带登录态（基于 Cookies 文件 + Local Storage 目录存在性）。
 * 不读 Cookies 内容（避免解密 SQLite），只看文件存在 + 大小 > 0。
 *
 * 注：Chromium 124+ 把 Cookies 从 Default/Cookies 移到了 Default/Network/Cookies，
 *     两路径都得查，否则新 profile 会误判为未登录。
 */
function getLoginStatus(platform) {
  if (!platform || !["小红书", "抖音"].includes(platform)) {
    throw new Error("请选择要登录的平台");
  }
  const profileDir = getProfileDir(platform);
  const home = getPlatformHome(platform);
  const exists = fs.existsSync(profileDir);
  let hasSession = false;
  let cookieSize = 0;
  let cookiePath = null;
  let localStorageExists = false;
  let lastModified = null;
  if (exists) {
    // 新旧 Chromium profile 路径兼容
    const candidateCookiePaths = [
      path.join(profileDir, "Default", "Network", "Cookies"),  // Chromium 124+
      path.join(profileDir, "Default", "Cookies"),              // Chromium < 124
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
    localStorageExists = fs.existsSync(path.join(profileDir, "Default", "Local Storage"));
  }
  return {
    platform,
    profileDir,
    home,
    isOpen: loginContexts.has(platform),
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

async function fetchMetricsFromUrl(url) {
  const targetUrl = normalizeUrl(url);
  if (!targetUrl) {
    throw new Error("作品链接不能为空");
  }

  const platform = detectPlatform(targetUrl);
  if (!platform) {
    throw new Error("暂时只支持小红书和抖音作品链接");
  }

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

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    const tLoad = Date.now();

    // ── 等待策略：抖音需要完整 SPA 渲染（networkidle + 1s），小红书用优化等待 ──
    if (platform === "抖音") {
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      await page.waitForLoadState("networkidle", { timeout: 800 }).catch(() => {});
      await page.waitForTimeout(200);
    }
    const pageTitle = await page.title().catch(() => "");

    const payload = platform === "小红书" ? await scrapeXiaohongshu(page) : await scrapeDouyin(page);

    // 抖音：DOM 层已抓到任意一项指标 → 页面有真实内容，不是登录墙。
    // 导航栏的"登录后"文案会触发误判，用 DOM 结果覆盖。
    const hasDouyinData = platform === "抖音"
      && (payload.likes > 0 || payload.comments > 0 || payload.favorites > 0 || payload.shares > 0);

    if (!hasDouyinData && looksLikeLoginWall(platform, payload.bodyText, pageTitle)) {
      // 登录墙 → 从池中移除，下次重新 launch
      contextReleased = true;
      releaseContext(platform);
      throw new Error(`当前打开的是${platform}登录页，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`);
    }

    const normalizedTitle = String((payload && payload.title) || pageTitle || "")
      .replace(/\s*-\s*小红书\s*$/, "")
      .replace(/\s*-\s*抖音\s*$/, "")
      .trim();

    let coverImageUrl = "";
    let coverThumbUrl = "";
    try {
      const cover = await capturePostCover(page, platform);
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
      metricsUpdatedAt: new Date().toISOString()
    };
    console.log(`[metricsFetcher] ${platform} 抓取完成: ${Date.now() - t0}ms (加载${tLoad - t0}ms) 赞${result.likes} 评${result.comments} 藏${result.favorites} 分享${result.shares}`);
    return result;
  } catch (err) {
    // 非登录墙错误：context 可能已损坏，从池中移除
    if (!String(err?.message || "").includes("登录页")) {
      contextReleased = true;
      releaseContext(platform);
    }
    throw err;
  } finally {
    // 关闭本次抓取打开的标签页。
    // contextReleased=true 时整个浏览器已被 releaseContext 关闭，无需再关 page。
    // 否则：先关 page，再兜底清理 context 中残留的非首页标签（防止泄漏）。
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

/**
 * 截取作品页视口作封面，sharp 缩放压成低分辨率 JPEG 落到 uploads/post-covers/。
 *
 * 历史策略：先 locator（平台特定选择器）→ video poster → og:image → first img → 视口兜底。
 *   实测抖音/小红书里 locator 选择器经常命中 32×32 头像、og:image 经常是 52×90 分享卡，
 *   "first img" 因 lazy load 拿到的是不可见的占位图，5 路并行下经常拿到的是错的。
 *   视口截图拿的是页面真实首屏，最稳。
 *
 * 优化：page.screenshot 用 omitBackground=false + clip 选作品主区（避开顶部导航）。
 *   整体 1.2s 上限；写入落盘 ~150ms。
 */
async function capturePostCover(page, platform) {
  try {
    // 抖音有头模式：字体正常加载，直接用 page.screenshot()。
    // 小红书无头模式：locator.screenshot() 绕过 CDP 字体等待。
    const useLocator = process.env.PLAYWRIGHT_HEADLESS !== "0" && platform !== "抖音";
    let buf;
    if (useLocator) {
      buf = await page.locator("body").screenshot({ type: "png", timeout: 8000 });
    } else {
      buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1440, height: 1080 }, timeout: 10000 });
    }
    console.log(`[metricsFetcher] 截图 buffer: ${buf ? buf.length : 'null'} bytes`);
    if (buf && buf.length > 1024) {
      const cover = await writeCoverJpeg(buf, "viewport");
      console.log(`[metricsFetcher] 封面写入: ${cover?.coverImageUrl || 'null'}`);
      return cover;
    }
    console.warn(`[metricsFetcher] 截图 buffer 过小(${buf?.length || 0} bytes)，跳过封面`);
  } catch (err) {
    console.warn(`[metricsFetcher] viewport screenshot failed: ${err?.message || err}`);
  }
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
