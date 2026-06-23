/**
 * Scraping V2 — 统一类型定义
 *
 * 重构目标：
 *   1. 按链接格式精确分类（小红书标准链/短链、抖音视频/图文/短链/主页弹窗）
 *   2. HAR / 网络响应驱动提取指标，告别 DOM  scraping 的脆弱性
 *   3. 封面直接截图，不再搞 SSR 语义封面 URL 的复杂提取链
 */

export interface ScrapedPostData {
  platform: '小红书' | '抖音';
  title: string;
  copywriting?: string;
  authorName?: string;
  authorId?: string;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  coverImageUrl?: string;   // 截图封面（直接存 uploads/post-covers/）
  coverThumbUrl?: string;   // 同上，目前与 coverImageUrl 一致
  publishedAt?: string;     // YYYY-MM-DD
  metricsUpdatedAt: string; // ISO 8601
}

export interface ScrapingFailure {
  code: string;
  retryable: boolean;
  message: string;
  platform: string;
}

export type ScrapingResult =
  | { ok: true; data: ScrapedPostData }
  | { ok: false; error: ScrapingFailure };

export function isScrapingFailure(r: ScrapingResult): r is { ok: false; error: ScrapingFailure } {
  return r.ok === false;
}

export interface UrlParseResult {
  platform: 'xiaohongshu' | 'douyin' | null;
  /** 精确链接类型，用于选择数据提取策略 */
  linkType:
    | 'xhs-standard'
    | 'xhs-short'
    | 'xhs-unknown'
    | 'douyin-video'
    | 'douyin-note'
    | 'douyin-short'
    | 'douyin-modal'
    | 'douyin-unknown'
    | 'unknown';
  /** 规范化后的完整 URL（短链已展开） */
  normalizedUrl: string;
  /** 平台内部 ID（小红书 noteId / 抖音 awemeId） */
  postId: string | null;
  /** 额外路径参数 */
  params: Record<string, string>;
}

export interface HarEntry {
  url: string;
  method: string;
  status: number;
  contentType: string;
  /** 已解析的 JSON body（当内容类型为 json 时） */
  jsonBody?: any;
  /** 原始文本 body（当 json 解析失败或内容类型为 text/html 时） */
  textBody?: string;
  /** 响应头 */
  headers: Record<string, string>;
  timestamp: number;
}

export interface HarSnapshot {
  entries: HarEntry[];
  startedAt: number;
  finishedAt: number;
}

export interface ScrapingOptions {
  retry?: number;
  timeout?: number;
  log?: (msg: string) => void;
  /** 是否记录完整 HAR（调试用，默认 false） */
  recordHar?: boolean;
}
