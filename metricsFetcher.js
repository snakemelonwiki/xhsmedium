const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DEFAULT_TIMEOUT = 15000;
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
const loginContexts = new Map();

fs.mkdirSync(PROFILE_ROOT, { recursive: true });

function detectPlatform(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("xiaohongshu.com") || value.includes("xhslink.com")) return "小红书";
  if (value.includes("douyin.com")) return "抖音";
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

    const candidates = [];

    if (root.note?.noteDetailMap && typeof root.note.noteDetailMap === "object") {
      candidates.push(...Object.values(root.note.noteDetailMap));
    }

    if (root.noteData?.data?.noteData) {
      candidates.push(root.noteData.data.noteData);
    }

    if (root.data?.noteData?.data?.noteData) {
      candidates.push(root.data.noteData.data.noteData);
    }

    if (root.noteData?.noteData) {
      candidates.push(root.noteData.noteData);
    }

    const pickCount = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const text = String(value).trim();
      return text || null;
    };

    for (const item of candidates) {
      if (!item || typeof item !== "object") continue;
      const interact = item.interact_info || item.interactInfo || {};
      const likes = pickCount(interact.liked_count ?? interact.likedCount ?? item.liked_count ?? item.likedCount);
      const comments = pickCount(interact.comment_count ?? interact.commentCount ?? item.comment_count ?? item.commentCount ?? item.comments_count);
      const favorites = pickCount(interact.collected_count ?? interact.collectedCount ?? interact.collect_count ?? interact.collectCount ?? item.collected_count ?? item.collectedCount);
      const shares = pickCount(interact.share_count ?? interact.shareCount ?? interact.shared_count ?? interact.sharedCount ?? item.share_count ?? item.shareCount);
      const title = String(item.title || item.display_title || item.note_title || "").trim();
      if (likes !== null || comments !== null || favorites !== null || shares !== null) {
        return { likes, comments, favorites, shares, title };
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

async function scrapeXiaohongshu(page) {
  const initialState = await readXiaohongshuInitialState(page);
  const precise = await readXiaohongshuEngageBar(page);
  const htmlFallback = await inferXiaohongshuCountsFromHtml(page);
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

  const fallback = await inferCountsFromBody(page);
  return {
    bodyText: fallback.text,
    title: initialState?.title || "",
    likes: likes ?? htmlFallback.likes ?? fallback.likes ?? 0,
    comments: comments ?? htmlFallback.comments ?? fallback.comments ?? 0,
    favorites: favorites ?? htmlFallback.favorites ?? fallback.favorites ?? 0,
    shares: shares ?? htmlFallback.shares ?? fallback.shares ?? 0
  };
}

async function scrapeDouyin(page) {
  const htmlFallback = await inferDouyinCountsFromHtml(page);
  const likes = await readCountBySelectors(page, [
    "[data-e2e='like-count']",
    "[class*='like'] [class*='count']",
    "span:has-text('赞') + span",
    "[aria-label*='点赞']",
    "[title*='点赞']"
  ]);
  const comments = await readCountBySelectors(page, [
    "[data-e2e='comment-count']",
    "[class*='comment'] [class*='count']",
    "span:has-text('评论') + span",
    "[aria-label*='评论']",
    "[title*='评论']"
  ]);
  const favorites = await readCountBySelectors(page, [
    "[data-e2e='collect-count']",
    "[data-e2e='favorite-count']",
    "[class*='collect'] [class*='count']",
    "span:has-text('收藏') + span",
    "[aria-label*='收藏']",
    "[title*='收藏']"
  ]);
  const shares = await readCountBySelectors(page, [
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
  openLoginBrowser
};
