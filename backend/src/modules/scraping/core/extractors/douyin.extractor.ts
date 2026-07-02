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
    // 收集所有数据源的结果，按指标完整度择优
    const candidates: Array<{ source: string; data: Partial<ScrapedPostData> }> = [];

    // ── 尝试从 RSC flight data 提取 ──
    const rscData = this.extractFromRscFlight(har, awemeIdHint);
    if (rscData && this.hasRealMetrics(rscData)) {
      candidates.push({ source: 'rsc-flight', data: rscData });
    }

    // ── 尝试从 RENDER_DATA 提取 ──
    const renderData = this.extractFromRenderData(har, awemeIdHint);
    if (renderData && this.hasRealMetrics(renderData)) {
      candidates.push({ source: 'render-data', data: renderData });
    }

    // ── 尝试从 API 拦截提取 ──
    const apiData = this.extractFromApi(har, awemeIdHint);
    if (apiData && this.hasRealMetrics(apiData)) {
      candidates.push({ source: 'api', data: apiData });
    }

    // ── HTML 正则兜底 ──
    const htmlFallback = this.extractFromHtml(har, awemeIdHint);
    if (htmlFallback && this.hasRealMetrics(htmlFallback)) {
      candidates.push({ source: 'html-fallback', data: htmlFallback });
    }

    // 按指标完整度排序：优先选有非零指标的，再选有标题的
    candidates.sort((a, b) => {
      const scoreA = this.scoreData(a.data);
      const scoreB = this.scoreData(b.data);
      return scoreB - scoreA;
    });

    if (candidates.length > 0) {
      const best = candidates[0];
      // 返回新对象，避免副作用（mutation）
      return { ...best.data, platform: '抖音' };
    }

    // 所有数据源都无有效指标，返回空结果
    return { platform: '抖音' };
  }

  /**
   * 检测抖音作品是否已失效/被删除。
   *
   * 失效作品（如 /note/<id> 指向已删除内容）的服务端会在 RSC flight data 中
   * 下发一个"SEO 包装对象"而非真实作品详情，其特征为：
   *   { awemeId: "<请求的 id>", aweme: null, statusCode: -404, accountInfo: { statusCode: 5 }, redirect, ... }
   *
   * 页面随后往往客户端跳转到 /jingxuan?previous_page=web_video_404_link&modal_id=<无关 id>，
   * 但该跳转存在时序竞态：若抓取在跳转前读取 URL，仅靠 url-parser 的 mismatch 检测会漏判，
   * 最终把死链伪造成"0 赞 0 评"的正常作品。此方法直接从 HAR 里的失效包装对象判定，
   * 不依赖跳转时序，作为可靠的兜底。
   *
   * @param awemeIdHint 请求的 awemeId，用于确认失效包装对象对应的是当前请求的作品
   * @returns 命中失效特征时返回 { reason }，否则返回 null
   */
  detectDeletedPost(har: HarSnapshot, awemeIdHint?: string | null): { reason: string } | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      if (!html.includes('__pace_f')) continue;

      const payloads = this.extractPaceFPayloads(html);
      for (const raw of payloads) {
        let unescaped = this.unescapeJsString(raw);
        if (unescaped.includes('%22') || unescaped.includes('%7B')) {
          try {
            unescaped = decodeURIComponent(unescaped);
          } catch {
            /* 解码失败则继续使用原字符串 */
          }
        }

        let idx = unescaped.indexOf('"awemeId"');
        while (idx !== -1) {
          const obj = this.findJsonObject(unescaped, idx);
          if (obj) {
            try {
              const data = JSON.parse(obj);
              const wrap = data?.detail || data;
              // 失效包装对象：显式带 aweme 字段且为 null（真实详情对象不含 aweme=null）
              if (wrap && typeof wrap === 'object' && 'aweme' in wrap && wrap.aweme === null) {
                const id = String(wrap.awemeId || wrap.aweme_id || '');
                const idMatches = !awemeIdHint || id === awemeIdHint;
                if (idMatches) {
                  const statusCode = Number(wrap.statusCode);
                  const acctStatus = Number(wrap?.accountInfo?.statusCode);
                  if ((Number.isFinite(statusCode) && statusCode < 0) || acctStatus === 5) {
                    const parts = [`statusCode=${wrap.statusCode}`];
                    if (Number.isFinite(acctStatus)) parts.push(`accountInfo.statusCode=${wrap.accountInfo.statusCode}`);
                    return { reason: parts.join(', ') };
                  }
                }
              }
            } catch {
              /* 解析失败跳过该对象 */
            }
          }
          idx = unescaped.indexOf('"awemeId"', idx + 1);
        }
      }
    }

    return null;
  }

  /**
   * 检查数据是否包含真实指标（至少有一个指标字段是数字，包括 0）
   * 注意：0 是合法指标值（如  赞），不应被过滤掉
   */
  private hasRealMetrics(data: Partial<ScrapedPostData>): boolean {
    const metrics = [data.likes, data.comments, data.favorites, data.shares];
    return metrics.some((v) => typeof v === 'number');
  }

  /**
   * 为数据打分，用于择优。
   * 有指标 > 0 的数据源获得高分，有标题/作者名的也有加分。
   */
  private scoreData(data: Partial<ScrapedPostData>): number {
    let score = 0;
    if ((data.likes ?? 0) > 0) score += 10;
    if ((data.comments ?? 0) > 0) score += 10;
    if ((data.favorites ?? 0) > 0) score += 10;
    if ((data.shares ?? 0) > 0) score += 10;
    if (data.title?.trim()) score += 5;
    if (data.authorName?.trim()) score += 3;
    if (data.authorId?.trim()) score += 2;
    return score;
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
    const payloads = this.extractPaceFPayloads(html);
    if (!payloads.length) return null;

    for (const raw of payloads) {
      let unescaped = this.unescapeJsString(raw);

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

  /**
   * 从 HTML 中精确提取 self.__pace_f.push([1, "..."]) 的字符串参数。
   * 使用字符级扫描而非正则，正确处理字符串中的转义引号。
   */
  private extractPaceFPayloads(html: string): string[] {
    const payloads: string[] = [];
    const prefix = 'self.__pace_f.push([1,"';
    let pos = 0;
    while (true) {
      const start = html.indexOf(prefix, pos);
      if (start === -1) break;
      let i = start + prefix.length;
      let escaped = false;
      const chars: string[] = [];
      while (i < html.length) {
        const c = html[i];
        if (escaped) {
          chars.push('\\', c);
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '"') {
          break;
        } else {
          chars.push(c);
        }
        i++;
      }
      if (i < html.length && html[i] === '"') {
        payloads.push(chars.join(''));
      }
      pos = i + 1;
    }
    return payloads;
  }

  private unescapeJsString(s: string): string {
    const escapes: Record<string, string> = {
      '\\"': '"',
      '\\\\': '\\',
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

    if (awemeIdHint) {
      const exact = candidates.filter((item) => item.awemeId === awemeIdHint);
      if (!exact.length) return null;
      exact.sort((a, b) => b.score - a.score || b.digg - a.digg);
      const bestExact = exact[0];
      if (bestExact.likes === null && bestExact.comments === null && bestExact.favorites === null && bestExact.shares === null) {
        return null;
      }
      return {
        title: bestExact.title,
        authorName: bestExact.authorName || undefined,
        authorId: bestExact.authorId || undefined,
        likes: bestExact.likes ?? 0,
        comments: bestExact.comments ?? 0,
        favorites: bestExact.favorites ?? 0,
        shares: bestExact.shares ?? 0,
        publishedAt: bestExact.publishDate || undefined,
      };
    }

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

      // 2. 兼容 aweme_list（个人主页 / 相关推荐），仅按 awemeIdHint 精确匹配
      if (!detail && awemeIdHint && Array.isArray(data.aweme_list) && data.aweme_list.length > 0) {
        detail = data.aweme_list.find((a: any) =>
          String(a.aweme_id || a.awemeId || '') === awemeIdHint,
        );
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

  private escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractFromHtml(har: HarSnapshot, awemeIdHint?: string | null): Partial<ScrapedPostData> | null {
    const htmlEntries = har.entries.filter((e) =>
      e.contentType.includes('text/html') && e.textBody,
    );

    for (const entry of htmlEntries) {
      const html = entry.textBody || '';
      if (!html) continue;

      // 按 awemeId 精确匹配当前视频的 JSON 块
      if (awemeIdHint) {
        const vidStr = this.escapeRegExp(String(awemeIdHint));
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
        continue;
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

    const apiStats = detail.statistics && typeof detail.statistics === 'object' ? detail.statistics : null;
    const rscStats = detail.stats && typeof detail.stats === 'object' ? detail.stats : null;

    // 失效/被删除作品的 SEO 包装对象（aweme=null, statusCode<0）没有任何指标容器，
    // 若继续走下面的 `?? 0` 会把死链伪造成"0 赞 0 评"的正常作品。此处直接判空返回。
    if (!apiStats && !rscStats) return null;

    const stats = {
      digg_count: (apiStats?.digg_count) ?? (rscStats?.diggCount),
      comment_count: (apiStats?.comment_count) ?? (rscStats?.commentCount),
      collect_count: (apiStats?.collect_count) ?? (rscStats?.collectCount),
      share_count: (apiStats?.share_count) ?? (rscStats?.shareCount),
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
    const hmsMatch = typeof value === 'string' && /^(\d{2}):(\d{2})$/.exec(value);
    if (hmsMatch) {
      const hour = Number(hmsMatch[1]);
      const minute = Number(hmsMatch[2]);
      return `${hour}:${String(minute).padStart(2, '0')}`;
    }

    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    const ms = n > 100000000000 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
