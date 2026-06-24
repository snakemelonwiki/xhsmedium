import { HarSnapshot, ScrapedPostData } from '../types';

/**
 * 抖音数据提取器
 *
 * 从 HAR 快照中提取帖子的标题、作者、指标、发布日期。
 *
 * 数据来源（按优先级从高到低）：
 *   1. RSC flight data（self.__pace_f.push）— 图文/笔记页 awemeType=68
 *   2. RENDER_DATA（<script id="RENDER_DATA">）— 视频页 SSR 数据
 *   3. API 拦截（/aweme/v1/web/aweme/detail/）— 个人主页弹窗视频
 *   4. HTML 正则兜底（按 awemeId 定位）
 *
 * 不再做 DOM scraping（不再依赖 DOM selector、SVG walk、XPath），
 * 所有数据来自网络响应（HAR）和 SSR 数据。
 */
export class DouyinExtractor {
  /**
   * 主入口：从 HAR 提取完整帖子数据
   * @param awemeIdHint 可选的 awemeId，用于精确匹配当前视频的数据
   */
  extract(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> {
    const result: Partial<ScrapedPostData> = {};

    // ── 尝试从 RSC flight data 提取（图文/笔记页优先） ──
    const rscData = this.extractFromRscFlight(har, awemeIdHint);
    if (rscData) {
      Object.assign(result, rscData);
      result.platform = '抖音';
      return result;
    }

    // ── 尝试从 RENDER_DATA 提取（视频页优先） ──
    const renderData = this.extractFromRenderData(har, awemeIdHint);
    if (renderData) {
      Object.assign(result, renderData);
      result.platform = '抖音';
      return result;
    }

    // ── 尝试从 API 拦截提取 ──
    const apiData = this.extractFromApi(har, awemeIdHint);
    if (apiData) {
      Object.assign(result, apiData);
      result.platform = '抖音';
      return result;
    }

    // ── HTML 正则兜底 ──
    const htmlFallback = this.extractFromHtml(har, awemeIdHint);
    if (htmlFallback) {
      Object.assign(result, htmlFallback);
      result.platform = '抖音';
    }

    return result;
  }

  // ── RSC flight data 提取 ──

  private extractFromRscFlight(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      if (!html.includes('__pace_f')) continue;

      const detail = this.parseRscFlightData(html, awemeIdHint);
      if (!detail) continue;

      const metrics = this.extractMetricsFromDetail(detail);
      if (metrics) return metrics;
    }

    return null;
  }

  /**
   * 解析抖音 RSC flight data 从 HTML 中提取作品详情。
   * 2026-06 抖音笔记/图文页（/note/xxx，awemeType=68）通过 `self.__pace_f.push` 下发。
   */
  private parseRscFlightData(html: string, awemeIdHint?: string | null): any | null {
    // 收集所有 __pace_f.push([1, "..."]) 的字符串参数
    const payloads: string[] = [];
    const pushRe = /self\.__pace_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
    let m: RegExpExecArray | null;
    while ((m = pushRe.exec(html)) !== null) {
      payloads.push(m[1]);
    }
    if (!payloads.length) return null;

    const unescapeJsString = (s: string) => {
      const escapes: Record<string, string> = {
        '\\"': '"',
        '\\': '\\',
        '\\n': '\n',
        '\\t': '\t',
        '\\r': '\r',
        '\\b': '\b',
        '\\f': '\f',
        '\\v': '\v',
      };
      return s.replace(/\\(?:["\\ntrbfv]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/g, (match) => {
        const mapped = escapes[match];
        if (mapped !== undefined) return mapped;
        // \uXXXX
        const u = match.match(/\\u([0-9a-fA-F]{4})/);
        if (u) return String.fromCharCode(parseInt(u[1], 16));
        // \xXX
        const x = match.match(/\\x([0-9a-fA-F]{2})/);
        if (x) return String.fromCharCode(parseInt(x[1], 16));
        return match;
      });
    };

    for (const raw of payloads) {
      let unescaped = unescapeJsString(raw);

      // 部分 __pace_f payload 仍是 URL 编码的 JSON，需要二次解码
      if (unescaped.includes('%22') || unescaped.includes('%7B')) {
        try {
          unescaped = decodeURIComponent(unescaped);
        } catch {
          /* 解码失败则继续使用原字符串 */
        }
      }

      const idx = unescaped.indexOf('"awemeId"');
      if (idx === -1) continue;

      // 找到包含 awemeId 的对象
      const obj = this.findJsonObject(unescaped, idx);
      if (!obj) continue;

      try {
        const data = JSON.parse(obj);
        const detail = data?.aweme?.detail || data?.detail || data;
        if (detail?.awemeId || detail?.aweme_id) {
          // 如果有 awemeIdHint，验证匹配
          if (awemeIdHint) {
            const id = String(detail.awemeId || detail.aweme_id);
            if (id !== awemeIdHint) continue;
          }
          return detail;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  // ── RENDER_DATA 提取 ──

  private extractFromRenderData(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      const match = html.match(/<script\s+id="RENDER_DATA"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
      if (!match?.[1]) continue;

      let decoded = match[1].trim();
      try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
      if (decoded.startsWith('%')) {
        try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
      }

      try {
        const json = JSON.parse(decoded);
        return this.findBestStatistics(json, awemeIdHint);
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * 在 RENDER_DATA JSON 中递归查找含 digg_count + comment_count 的 statistics 对象
   */
  private findBestStatistics(obj: any, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const candidates: Array<{
      likes: number | null;
      comments: number | null;
      favorites: number | null;
      shares: number | null;
      title: string;
      authorName: string;
      authorId: string;
      publishDate: string;
      score: number;
      digg: number;
      awemeId: string;
    }> = [];

    const pick = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const walk = (o: any, depth: number): void => {
      if (!o || typeof o !== 'object' || depth > 8) return;

      if (o.statistics && typeof o.statistics === 'object'
        && ('digg_count' in o.statistics || 'comment_count' in o.statistics)) {
        const s = o.statistics;
        const awemeId = String(o.aweme_id || o.awemeId || '');

        // 如果有 awemeIdHint，优先匹配
        const idMatch = awemeIdHint ? (awemeId === awemeIdHint ? 100 : -100) : 0;

        candidates.push({
          likes: pick(s.digg_count ?? s.like_count),
          comments: pick(s.comment_count),
          favorites: pick(s.collect_count ?? s.favorite_count),
          shares: pick(s.share_count),
          title: String(o.desc || o.title || '').trim(),
          authorName: String(o.author?.nickname || o.authorInfo?.nickname || '').trim(),
          authorId: String(o.author?.uid || o.authorInfo?.uid || '').trim(),
          publishDate: this.formatTimestamp(o.create_time ?? o.createTime),
          score: [pick(s.digg_count), pick(s.comment_count), pick(s.collect_count), pick(s.share_count)].filter((v) => v !== null).length + idMatch,
          digg: Number(s.digg_count || 0),
          awemeId,
        });
      }

      for (const v of Object.values(o)) walk(v, depth + 1);
    };

    walk(obj, 0);
    if (!candidates.length) return null;

    // 选质量分最高的；同分时取 digg_count 最大的
    candidates.sort((a, b) => b.score - a.score || b.digg - a.digg);
    const best = candidates[0];

    if (best.likes === null && best.comments === null && best.favorites === null && best.shares === null) {
      return null;
    }

    return {
      title: best.title,
      authorName: best.authorName || undefined,
      authorId: best.authorId || undefined,
      likes: best.likes ?? 0,
      comments: best.comments ?? 0,
      favorites: best.favorites ?? 0,
      shares: best.shares ?? 0,
      publishedAt: best.publishDate || undefined,
    };
  }

  // ── API 拦截提取 ──

  private extractFromApi(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const entries = har.entries.filter((e) =>
      /\/aweme\/v1\/web\/aweme\/(?:detail|post|related)\//i.test(e.url) && (e.jsonBody || e.textBody),
    );

    for (const entry of entries) {
      const data = entry.jsonBody || this.tryDecodeBase64Json(entry.textBody);
      if (!data || typeof data !== 'object') continue;

      // 1. 优先取 aweme_detail（老视频详情页）
      let detail = data.aweme_detail;

      // 2. 兼容 aweme_list（个人主页 / 相关推荐）
      if (!detail && Array.isArray(data.aweme_list) && data.aweme_list.length > 0) {
        if (awemeIdHint) {
          detail = data.aweme_list.find((a: any) =>
            String(a.aweme_id || a.awemeId || '') === awemeIdHint,
          );
        }
        if (!detail) {
          detail = data.aweme_list[0];
        }
      }
      if (!detail) continue;

      // 验证 awemeId 匹配
      if (awemeIdHint) {
        const id = String(detail.aweme_id || detail.awemeId || '');
        if (id && id !== awemeIdHint) continue;
      }

      return this.extractMetricsFromDetail(detail);
    }

    return null;
  }

  /**
   * 抖音部分 API 返回 base64 编码的 JSON（如 /aweme/v1/web/aweme/post/）。
   */
  private tryDecodeBase64Json(text: string | undefined): any | null {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) return null;
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      if (!decoded || decoded.includes('�')) return null;
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  // ── HTML 正则兜底 ──

  private extractFromHtml(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      if (!html) continue;

      // 按 awemeId 精确匹配当前视频的 JSON 块
      if (awemeIdHint) {
        const vidStr = String(awemeIdHint);
        const patterns = [
          new RegExp(`"${vidStr}"\\s*:\\s*\\{[\\s\\S]{0,2000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`, 'i'),
          new RegExp(`"${vidStr}"[\\s\\S]{0,3000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`, 'i'),
        ];

        for (const pattern of patterns) {
          const blockMatch = html.match(pattern);
          if (blockMatch?.[1]) {
            const block = blockMatch[1];
            const extract = (key: string): number | null => {
              const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, 'i');
              const m = block.match(re);
              return m ? Number(m[1]) : null;
            };
            const likes = extract('digg_count');
            const comments = extract('comment_count');
            const favorites = extract('collect_count');
            const shares = extract('share_count');
            if (likes !== null || comments !== null || favorites !== null || shares !== null) {
              return { likes: likes ?? 0, comments: comments ?? 0, favorites: favorites ?? 0, shares: shares ?? 0 };
            }
          }
        }
      }

      // 全局兜底：找第一个含 digg_count 的 statistics 块
      const globalMatch = html.match(/"statistics"\s*:\s*\{([^}]+)\}/i);
      if (globalMatch?.[1]) {
        const block = globalMatch[1];
        const extract = (key: string): number | null => {
          const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, 'i');
          const m = block.match(re);
          return m ? Number(m[1]) : null;
        };
        return {
          likes: extract('digg_count') ?? 0,
          comments: extract('comment_count') ?? 0,
          favorites: extract('collect_count') ?? 0,
          shares: extract('share_count') ?? 0,
        };
      }
    }

    return null;
  }

  // ── 通用 detail 解析 ──

  /**
   * 从抖音 aweme detail 对象提取指标。
   * 兼容两种结构：
   *   1. API /aweme/v1/web/aweme/detail/ 返回：detail.statistics（snake_case）+ detail.author
   *   2. RSC flight data（图文/笔记页 awemeType=68）：detail.stats（camelCase）+ detail.authorInfo
   */
  private extractMetricsFromDetail(detail: any): Partial<ScrapedPostData> | null {
    if (!detail || typeof detail !== 'object') return null;

    const apiStats = detail.statistics || {};
    const rscStats = detail.stats || {};
    const stats = {
      digg_count: apiStats.digg_count ?? rscStats.diggCount,
      comment_count: apiStats.comment_count ?? rscStats.commentCount,
      collect_count: apiStats.collect_count ?? rscStats.collectCount,
      share_count: apiStats.share_count ?? rscStats.shareCount,
    };

    const author = detail.author || detail.authorInfo || {};

    // 发布日期
    let publishDate: string | undefined;
    const ts = detail.create_time ?? detail.createTime;
    if (ts) {
      publishDate = this.formatTimestamp(ts);
    }

    return {
      title: String(detail.desc || '').trim(),
      authorName: String(author.nickname || '').trim() || undefined,
      authorId: String(author.uid || author.short_id || author.user_id || '').trim() || undefined,
      likes: Number(stats.digg_count ?? 0),
      comments: Number(stats.comment_count ?? 0),
      favorites: Number(stats.collect_count ?? 0),
      shares: Number(stats.share_count ?? 0),
      publishedAt: publishDate,
    };
  }

  // ── 工具函数 ──

  private findJsonObject(text: string, startIdx: number): string | null {
    // 向前找到对象起始大括号
    let start = -1;
    let braceCount = 0;
    for (let i = startIdx; i >= 0; i--) {
      if (text[i] === '}') braceCount++;
      if (text[i] === '{') {
        if (braceCount === 0) {
          start = i;
          break;
        }
        braceCount--;
      }
    }
    if (start === -1) return null;

    // 向后找到匹配的大括号
    braceCount = 0;
    let inString = false;
    let escape = false;
    let end = start;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') braceCount++;
      if (c === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) return null;

    let jsonStr = text.slice(start, end);
    // 清理 RSC 特殊占位符
    jsonStr = jsonStr.replace(/"\$undefined"/g, 'null').replace(/"\$L\d+"/g, 'null');
    jsonStr = jsonStr.replace(/:\$undefined([,}])/g, ':null$1');

    return jsonStr;
  }

  private formatTimestamp(value: unknown): string {
    if (value === null || value === undefined) return '';
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    const ms = n > 100000000000 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
