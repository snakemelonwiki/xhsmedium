const fs = require("fs");
const path = require("path");

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

const DEFAULT_TIMEOUT = 15000;
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
const loginContexts = new Map();

fs.mkdirSync(PROFILE_ROOT, { recursive: true });

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

async function readTextBySelectors(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 1200 });
      const text = (await locator.textContent()) || "";
      if (text.trim()) return text.trim();
    } catch {}
  }
  return "";
}

async function readCountBySelectors(page, selectors) {
  const direct = await readTextBySelectors(page, selectors);
  const parsed = parseCount(direct);
  if (parsed !== null) return parsed;
  return null;
}

async function inferDouyinCountsFromHtml(page) {
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
      /"digg_count"\s*:\s*(\d+)/i,
      /"diggCount"\s*:\s*(\d+)/i,
      /"like_count"\s*:\s*(\d+)/i,
      /"likeCount"\s*:\s*(\d+)/i,
      /"admire_count"\s*:\s*(\d+)/i,
      /"admireCount"\s*:\s*(\d+)/i
    ]),
    comments: readByPatterns([
      /"comment_count"\s*:\s*(\d+)/i,
      /"commentCount"\s*:\s*(\d+)/i
    ]),
    favorites: readByPatterns([
      /"collect_count"\s*:\s*(\d+)/i,
      /"collectCount"\s*:\s*(\d+)/i,
      /"favorite_count"\s*:\s*(\d+)/i,
      /"favoriteCount"\s*:\s*(\d+)/i
    ]),
    shares: readByPatterns([
      /"share_count"\s*:\s*(\d+)/i,
      /"shareCount"\s*:\s*(\d+)/i,
      /"share_num"\s*:\s*(\d+)/i,
      /"shareNum"\s*:\s*(\d+)/i
    ])
  };
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

async function scrapeDouyin(page) {
  const htmlFallback = await inferDouyinCountsFromHtml(page);
  const likes = await readCountBySelectors(page, [
    "xpath=//*[@id=\"sliderVideo\"]/div[1]/div/div[1]/div[1]/div/div[2]/div[2]/div/div[2]",
    "[data-e2e='like-count']",
    "[class*='like'] [class*='count']",
    "span:has-text('赞') + span",
    "[aria-label*='点赞']",
    "[title*='点赞']"
  ]);
  const comments = await readCountBySelectors(page, [
    "xpath=//*[@id=\"sliderVideo\"]/div[1]/div/div[1]/div[1]/div/div[2]/div[3]/div[1]/div[2]",
    "[data-e2e='comment-count']",
    "[class*='comment'] [class*='count']",
    "span:has-text('评论') + span",
    "[aria-label*='评论']",
    "[title*='评论']"
  ]);
  const favorites = await readCountBySelectors(page, [
    "xpath=//*[@id=\"sliderVideo\"]/div[1]/div/div[1]/div[1]/div/div[2]/div[4]/div[2]",
    "[data-e2e='collect-count']",
    "[data-e2e='favorite-count']",
    "[class*='collect'] [class*='count']",
    "span:has-text('收藏') + span",
    "[aria-label*='收藏']",
    "[title*='收藏']"
  ]);
  const shares = await readCountBySelectors(page, [
    "xpath=//*[@id=\"sliderVideo\"]/div[1]/div/div[1]/div[1]/div/div[2]/div[6]/div[1]/div[2]",
    "[data-e2e='share-count']",
    "[class*='share'] [class*='count']",
    "span:has-text('分享') + span",
    "[aria-label*='分享']",
    "[title*='分享']"
  ]);

  const fallback = await inferCountsFromBody(page);
  return {
    bodyText: fallback.text,
    likes: likes ?? htmlFallback.likes ?? fallback.likes ?? 0,
    comments: comments ?? htmlFallback.comments ?? fallback.comments ?? 0,
    favorites: favorites ?? htmlFallback.favorites ?? fallback.favorites ?? 0,
    shares: shares ?? htmlFallback.shares ?? fallback.shares ?? 0
  };
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

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 980 },
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

  const context = await launchProfileContext(platform);
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const pageTitle = await page.title().catch(() => "");

    const payload = platform === "小红书" ? await scrapeXiaohongshu(page) : await scrapeDouyin(page);
    if (looksLikeLoginWall(platform, payload.bodyText, pageTitle)) {
      throw new Error(`当前打开的是${platform}登录页，请先在“链接测试”里点“打开${platform}登录浏览器”完成一次登录。`);
    }

    const normalizedTitle = String((payload && payload.title) || pageTitle || "")
      .replace(/\s*-\s*小红书\s*$/, "")
      .replace(/\s*-\s*抖音\s*$/, "")
      .trim();

    return {
      platform,
      title: normalizedTitle,
      authorName: payload?.authorName || "",
      authorId: payload?.authorId || "",
      likes: Number(payload.likes || 0),
      comments: Number(payload.comments || 0),
      favorites: Number(payload.favorites || 0),
      shares: Number(payload.shares || 0),
      metricsUpdatedAt: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

module.exports = {
  detectPlatform,
  fetchMetricsFromUrl,
  openLoginBrowser,
  closeLoginBrowser,
  getLoginStatus,
  getProfileDir,
  getPlatformHome,
};
