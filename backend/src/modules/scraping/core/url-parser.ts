import { UrlParseResult } from './types';

/**
 * URL 分类器 — 精确识别链接格式，决定后续数据提取策略
 *
 * 小红书：
 *   - 标准链: https://www.xiaohongshu.com/explore/<noteId>?xsec_token=...&xsec_source=...
 *   - 短链:  https://xhslink.com/<code> （会被 302 到标准链）
 *   - 其他:  带 xiaohongshu.com 域名但无法提取 ID
 *
 * 抖音：
 *   - 视频链: https://www.douyin.com/video/<awemeId>
 *   - 图文/笔记: https://www.douyin.com/note/<awemeId>
 *   - 短链: https://v.douyin.com/<code> （会被 302 到视频/图文链）
 *   - 主页弹窗: https://www.douyin.com/user/self?modal_id=<awemeId>
 *   - 其他: 带 douyin.com 域名但无法提取 ID
 *
 * 安全说明：
 *   使用 new URL() 解析 hostname 进行白名单校验，避免基于子字符串的 SSRF。
 *   例如 https://evil.com/?q=xiaohongshu.com 不会误匹配。
 */
export function parseUrl(raw: string): UrlParseResult {
  const url = String(raw || '').trim();
  if (!url) {
    return {
      platform: null,
      linkType: 'unknown',
      normalizedUrl: '',
      postId: null,
      params: {},
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // 非法 URL（如短链可能被截断）
    return tryParseShortLink(url);
  }

  const hostname = parsed.hostname.toLowerCase();

  // ── 小红书 ──
  if (
    hostname === 'xiaohongshu.com' ||
    hostname.endsWith('.xiaohongshu.com') ||
    hostname === 'xhslink.com' ||
    hostname.endsWith('.xhslink.com')
  ) {
    return parseXiaohongshu(url, hostname);
  }

  // ── 抖音 ──
  if (
    hostname === 'douyin.com' ||
    hostname.endsWith('.douyin.com') ||
    hostname === 'iesdouyin.com' ||
    hostname.endsWith('.iesdouyin.com')
  ) {
    return parseDouyin(url, hostname);
  }

  return {
    platform: null,
    linkType: 'unknown',
    normalizedUrl: url,
    postId: null,
    params: {},
  };
}

function parseXiaohongshu(url: string, hostname: string): UrlParseResult {
  // 短链：xhslink.com/xxx
  if (hostname === 'xhslink.com' || hostname.endsWith('.xhslink.com')) {
    const code = url.match(/xhslink\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return {
      platform: 'xiaohongshu',
      linkType: 'xhs-short',
      normalizedUrl: url, // 短链在浏览器中会 302 到标准链，由 Playwright 自动处理
      postId: code || null,
      params: code ? { shortCode: code } : {},
    };
  }

  // 标准链：/explore/<noteId> 或 /discovery/item/<noteId>
  const exploreMatch = url.match(/\/explore\/([a-zA-Z0-9]+)/i);
  if (exploreMatch) {
    const noteId = exploreMatch[1];
    // 提取 xsec_token / xsec_source（登录态校验用）
    const params: Record<string, string> = {};
    const xsecToken = url.match(/[?&]xsec_token=([^&]+)/i)?.[1];
    const xsecSource = url.match(/[?&]xsec_source=([^&]+)/i)?.[1];
    if (xsecToken) params.xsecToken = xsecToken;
    if (xsecSource) params.xsecSource = xsecSource;
    return {
      platform: 'xiaohongshu',
      linkType: 'xhs-standard',
      normalizedUrl: url,
      postId: noteId,
      params,
    };
  }

  // 旧版 discovery/item
  const legacyMatch = url.match(/\/discovery\/item\/([a-zA-Z0-9]+)/i);
  if (legacyMatch) {
    return {
      platform: 'xiaohongshu',
      linkType: 'xhs-standard',
      normalizedUrl: url,
      postId: legacyMatch[1],
      params: {},
    };
  }

  // 小红书域名但无法识别格式
  return {
    platform: 'xiaohongshu',
    linkType: 'xhs-unknown',
    normalizedUrl: url,
    postId: null,
    params: {},
  };
}

function parseDouyin(url: string, hostname: string): UrlParseResult {
  // 短链：v.douyin.com/xxx
  if (hostname === 'v.douyin.com' || hostname.endsWith('.v.douyin.com')) {
    const code = url.match(/v\.douyin\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return {
      platform: 'douyin',
      linkType: 'douyin-short',
      normalizedUrl: url,
      postId: code || null,
      params: code ? { shortCode: code } : {},
    };
  }

  // 视频链：/video/<awemeId>
  const videoMatch = url.match(/\/video\/(\d+)/i);
  if (videoMatch) {
    return {
      platform: 'douyin',
      linkType: 'douyin-video',
      normalizedUrl: url,
      postId: videoMatch[1],
      params: {},
    };
  }

  // 图文/笔记链：/note/<awemeId>（awemeType=68）
  const noteMatch = url.match(/\/note\/(\d+)/i);
  if (noteMatch) {
    return {
      platform: 'douyin',
      linkType: 'douyin-note',
      normalizedUrl: url,
      postId: noteMatch[1],
      params: {},
    };
  }

  // 主页弹窗：/user/self?modal_id=<awemeId>
  const modalMatch = url.match(/[?&]modal_id=(\d+)/i);
  if (modalMatch) {
    return {
      platform: 'douyin',
      linkType: 'douyin-modal',
      normalizedUrl: url,
      postId: modalMatch[1],
      params: {},
    };
  }

  // 老短链：iesdouyin.com
  if (hostname === 'iesdouyin.com' || hostname.endsWith('.iesdouyin.com')) {
    return {
      platform: 'douyin',
      linkType: 'douyin-short',
      normalizedUrl: url,
      postId: null,
      params: {},
    };
  }

  // 抖音域名但无法识别格式
  return {
    platform: 'douyin',
    linkType: 'douyin-unknown',
    normalizedUrl: url,
    postId: null,
    params: {},
  };
}

/**
 * 兜底：当 new URL() 解析失败时（如某些短链格式不规范），
 * 尝试用子字符串匹配（仅在明确含短链域名时）。
 */
function tryParseShortLink(url: string): UrlParseResult {
  const lower = url.toLowerCase();
  if (lower.includes('xhslink.com')) {
    const code = url.match(/xhslink\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return {
      platform: 'xiaohongshu',
      linkType: 'xhs-short',
      normalizedUrl: url,
      postId: code || null,
      params: code ? { shortCode: code } : {},
    };
  }
  if (lower.includes('v.douyin.com')) {
    const code = url.match(/v\.douyin\.com\/([a-zA-Z0-9_-]+)/i)?.[1] || '';
    return {
      platform: 'douyin',
      linkType: 'douyin-short',
      normalizedUrl: url,
      postId: code || null,
      params: code ? { shortCode: code } : {},
    };
  }
  return {
    platform: null,
    linkType: 'unknown',
    normalizedUrl: url,
    postId: null,
    params: {},
  };
}
