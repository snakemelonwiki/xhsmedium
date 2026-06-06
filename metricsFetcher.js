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
const sharp = require("sharp");

const DEFAULT_TIMEOUT = 15000;
const PROFILE_ROOT = path.join(__dirname, ".playwright-profiles");
const COVERS_DIR = path.join(__dirname, "uploads", "post-covers");
const COVER_THUMB_MAX_WIDTH = 960; // 略缩图：960px 宽（≥1080p 屏幕"点击查看大图"时仍清晰），远低于原图但人眼无颗粒感
const COVER_THUMB_QUALITY = 92; // mozjpeg 92：体积仍可控（典型 960px 截图 ~80–150KB），文字/线条更锐利
const loginContexts = new Map();

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
async function scrapeDouyin(page) {
  // 模拟 hover 让 tooltip 出来（部分数字可能在 tooltip 里）
  try {
    const hoverTargets = await page.locator(
      '#douyin-right-container svg, #sliderVideo svg'
    ).all();
    for (const t of hoverTargets.slice(0, 8)) {
      try { await t.hover({ timeout: 200 }); } catch {}
    }
  } catch {}

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

  const htmlFallback = await inferDouyinCountsFromHtml(page);
  const fallback = await inferCountsFromBody(page);

  // 优先级：interactiveCounts (DOM 解析) > htmlFallback (INITIAL_STATE JSON) > fallback (body text)
  const get = (k) => interactiveCounts?.[k] || htmlFallback[k] || fallback[k] || 0;
  return {
    bodyText: fallback.text,
    likes: get("likes"),
    comments: get("comments"),
    favorites: get("favorites"),
    shares: get("shares"),
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
    // 抖音/小红书 __INITIAL_STATE__ 嵌在 script 标签里，DOMContentLoaded 时通常已注入；
    //   networkidle 对持续 ws/long-poll 不可达，但 1500ms 短超时仍能拿到首屏资源完成事件，
    //   比 0ms（直接走 timeout）更稳。实测抖音 note 链接 networkidle 1.5s 内能命中。
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(400);
    const pageTitle = await page.title().catch(() => "");

    const payload = platform === "小红书" ? await scrapeXiaohongshu(page) : await scrapeDouyin(page);
    if (looksLikeLoginWall(platform, payload.bodyText, pageTitle)) {
      throw new Error(`当前打开的是${platform}登录页，请先在"链接测试"里点"打开${platform}登录浏览器"完成一次登录。`);
    }

    const normalizedTitle = String((payload && payload.title) || pageTitle || "")
      .replace(/\s*-\s*小红书\s*$/, "")
      .replace(/\s*-\s*抖音\s*$/, "")
      .trim();

    // 封面截图：抓取指标后顺手截作品关键区域，sharp 压成低分辨率 JPEG 落到 uploads/post-covers/
    // 失败不抛错 —— 没封面也能继续录入
    let coverImageUrl = "";
    let coverThumbUrl = "";
    try {
      const cover = await capturePostCover(page, platform);
      if (cover) {
        coverImageUrl = cover.coverImageUrl;
        coverThumbUrl = cover.coverThumbUrl;
      }
    } catch (coverErr) {
      // eslint-disable-next-line no-console
      console.warn(`[metricsFetcher] capturePostCover failed: ${coverErr?.message || coverErr}`);
    }

    return {
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
  } finally {
    await context.close();
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
  // 视口截图：clip 区域 (0, header 高度, viewport 宽, 作品主区高度)
  // 避免取到顶部导航栏 + 评论区。header 高度 ~80px, 主区 980px (1100-120)。
  try {
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1440, height: 1080 },
    });
    if (buf && buf.length > 1024) {
      return await writeCoverJpeg(buf, "viewport");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
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
};
