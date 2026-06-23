import { HarSnapshot, ScrapedPostData } from '../types';

/**
 * 小红书数据提取器
 *
 * 2026-06-21 v3 重构：
 *   - 删除了永远跑不通的 HTML 正则兜底（__INITIAL_STATE__ 是 JS 字面量，
 *     `JSON.parse` 直接抛错；且 Vue 3 reactive 代理也无法整体 stringify）。
 *   - ssrExtracted 改为接收 *已在浏览器内按字段提取过的扁平对象*，
 *     由 scraper.service.ts 的 page.evaluate 负责（noteIdHint 在那里精确匹配 noteDetailMap）。
 *   - noteId 真正生效：HAR 的 Feed API 也尝试按 noteId 选 item。
 *   - 成功判据从 `title` 改为 "title || 任一指标>0 || authorName"。
 *   - 多源合并：先收 SSR，再用 Feed/Note API 填补缺失字段。
 *
 * 数据来源（按优先级）：
 *   1. SSR 已提取字段（来自浏览器 page.evaluate）
 *   2. Feed API（HAR）
 *   3. Note Detail API（HAR）
 *   4. HTML meta 标签（仅兜底 title）
 */

/** scraper.service 在 page.evaluate 内沿 SSR 路径取出的标量字段 */
export interface XhsSsrExtracted {
  title: string;
  authorName?: string;
  authorId?: string;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  /** 毫秒时间戳 */
  time?: number;
  _source?: string;
}

export class XiaohongshuExtractor {
  /**
   * 主入口：合并 SSR + HAR + meta 多个来源
   * @param har HAR 快照
   * @param ssrExtracted 浏览器侧 evaluate 沿已知路径取出的扁平字段（可为 null）
   * @param noteIdHint URL 中的 noteId，用于在 HAR API items 中精确匹配
   */
  extract(
    har: HarSnapshot,
    ssrExtracted: XhsSsrExtracted | null | undefined,
    noteIdHint?: string | null,
  ): Partial<ScrapedPostData> {
    const sources: Partial<ScrapedPostData>[] = [];

    const ssr = this.fromSsrExtracted(ssrExtracted);
    if (this.hasMeaningfulData(ssr)) sources.push(ssr!);

    const feed = this.extractFromFeedApi(har, noteIdHint);
    if (this.hasMeaningfulData(feed)) sources.push(feed!);

    const note = this.extractFromNoteApi(har);
    if (this.hasMeaningfulData(note)) sources.push(note!);

    const meta = this.extractFromMeta(har);
    if (meta?.title) sources.push(meta);

    if (!sources.length) return { platform: '小红书' };

    return { ...this.mergeSources(sources), platform: '小红书' };
  }

  /** 多源按字段合并：字符串取首个非空；数值取首个 > 0 */
  private mergeSources(sources: Partial<ScrapedPostData>[]): Partial<ScrapedPostData> {
    const out: Partial<ScrapedPostData> = {};
    const pickStr = (key: keyof ScrapedPostData) => {
      for (const s of sources) {
        const v = (s as any)[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return undefined;
    };
    const pickNum = (key: keyof ScrapedPostData) => {
      for (const s of sources) {
        const v = (s as any)[key];
        if (typeof v === 'number' && v > 0) return v;
      }
      return 0;
    };

    out.title = pickStr('title') || '';
    out.authorName = pickStr('authorName');
    out.authorId = pickStr('authorId');
    out.publishedAt = pickStr('publishedAt');
    out.likes = pickNum('likes');
    out.comments = pickNum('comments');
    out.favorites = pickNum('favorites');
    out.shares = pickNum('shares');
    return out;
  }

  private hasMeaningfulData(data: Partial<ScrapedPostData> | null | undefined): boolean {
    if (!data) return false;
    return Boolean(
      data.title ||
      data.authorName ||
      (data.likes && data.likes > 0) ||
      (data.comments && data.comments > 0) ||
      (data.favorites && data.favorites > 0) ||
      (data.shares && data.shares > 0),
    );
  }

  // ── 来自浏览器 evaluate 的 SSR 提取结果 ──

  private fromSsrExtracted(s: XhsSsrExtracted | null | undefined): Partial<ScrapedPostData> | null {
    if (!s || typeof s !== 'object') return null;
    return {
      title: String(s.title || '').trim(),
      authorName: s.authorName ? String(s.authorName).trim() : undefined,
      authorId: s.authorId ? String(s.authorId).trim() : undefined,
      likes: Number(s.likes) || 0,
      comments: Number(s.comments) || 0,
      favorites: Number(s.favorites) || 0,
      shares: Number(s.shares) || 0,
      publishedAt: this.parseTimestamp(s.time),
    };
  }

  // ── Feed API 提取（HAR） ──

  private extractFromFeedApi(
    har: HarSnapshot,
    noteIdHint?: string | null,
  ): Partial<ScrapedPostData> | null {
    const entries = har.entries.filter((e) =>
      /\/api\/sns\/web\/v[12]\/feed/i.test(e.url) && e.jsonBody,
    );

    for (const entry of entries) {
      const data = entry.jsonBody;
      const items = data?.data?.items || data?.items;
      if (!Array.isArray(items) || !items.length) continue;

      let target: any = null;
      if (noteIdHint) {
        target = items.find((it: any) => {
          const id = it?.id || it?.note_card?.note_id || it?.note_card?.id;
          return id === noteIdHint;
        });
      }
      if (!target) target = items[0];

      const card = target?.note_card || target?.noteCard;
      if (!card) continue;

      const shaped = this.shapeFromXhsCard(card);
      if (shaped) return shaped;
    }

    return null;
  }

  // ── Note Detail API 提取（HAR） ──

  private extractFromNoteApi(har: HarSnapshot): Partial<ScrapedPostData> | null {
    const entries = har.entries.filter((e) => {
      // 排除 /note/metrics_report 这类分析端点
      if (/\/note\/metrics_report/i.test(e.url)) return false;
      return /\/api\/sns\/web\/v\d+\/note\b/i.test(e.url) && e.jsonBody;
    });

    for (const entry of entries) {
      const data = entry.jsonBody;
      const noteData = data?.data?.noteData || data?.noteData;
      if (!noteData) continue;

      const note = noteData.note || noteData;
      const shaped = this.shapeFromXhsNote(note);
      if (shaped) return shaped;
    }

    return null;
  }

  // ── HTML meta 提取（仅 title 兜底） ──

  private extractFromMeta(har: HarSnapshot): Partial<ScrapedPostData> | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      const title =
        html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)?.[1] ||
        html.match(/<meta\s+name="title"\s+content="([^"]*)"/)?.[1] ||
        '';
      if (title) return { title };
    }

    return null;
  }

  // ── 形状归一 ──

  private shapeFromXhsNote(note: any): Partial<ScrapedPostData> | null {
    if (!note || typeof note !== 'object') return null;
    const interact = note.interact_info || note.interactInfo || {};
    const user = note.user || {};

    return {
      title: String(note.title || note.display_title || note.desc || '').trim(),
      authorName: String(user.nickname || '').trim() || undefined,
      authorId: String(user.user_id || user.userId || '').trim() || undefined,
      likes: this.parseCount(interact.liked_count ?? interact.likedCount),
      comments: this.parseCount(interact.comment_count ?? interact.commentCount),
      favorites: this.parseCount(interact.collected_count ?? interact.collectedCount),
      shares: this.parseCount(interact.share_count ?? interact.shareCount),
      publishedAt: this.extractDateFromXhsNote(note),
    };
  }

  private shapeFromXhsCard(card: any): Partial<ScrapedPostData> | null {
    if (!card || typeof card !== 'object') return null;
    const info = card.interact_info || card.interactInfo || {};
    const user = card.user || {};

    return {
      title: String(card.title || card.desc || '').trim(),
      authorName: String(user.nickname || '').trim() || undefined,
      authorId: String(user.user_id || user.userId || '').trim() || undefined,
      likes: this.parseCount(info.liked_count ?? info.likedCount),
      comments: this.parseCount(info.comment_count ?? info.commentCount),
      favorites: this.parseCount(info.collected_count ?? info.collectedCount),
      shares: this.parseCount(info.share_count ?? info.shareCount),
      publishedAt: this.extractDateFromXhsNote(card),
    };
  }

  // ── 工具函数 ──

  private parseCount(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).trim().toLowerCase().replace(/,/g, '');
    if (!text) return 0;
    const match = text.match(/(\d+(?:\.\d+)?)\s*([wk万千]?)/);
    if (!match) return Number(text) || 0;
    const amount = Number(match[1]);
    const unit = match[2].trim();
    if (Number.isNaN(amount)) return 0;
    if (unit === 'w' || unit === '万') return Math.round(amount * 10000);
    if (unit === 'k' || unit === '千') return Math.round(amount * 1000);
    return Math.round(amount);
  }

  /** 小红书的发布时间字段：`time`（毫秒）+ `last_update_time` */
  private extractDateFromXhsNote(note: any): string | undefined {
    const fields = [note?.time, note?.time_ms, note?.timestamp, note?.last_update_time];
    for (const value of fields) {
      const date = this.parseTimestamp(value);
      if (date) return date;
    }
    return undefined;
  }

  private parseTimestamp(value: unknown): string | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const ms = n > 100000000000 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return undefined;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
