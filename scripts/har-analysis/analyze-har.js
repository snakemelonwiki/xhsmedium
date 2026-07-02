/**
 * analyze-har.js
 *
 * 全面分析抖音帖子 HAR 快照，诊断数据提取器（DouyinExtractor）
 * 无法获取指标的根本原因。
 *
 * 功能：
 *   1. 解析 HAR 中所有含数据源的条目
 *   2. 按数据源分类提取并交叉验证（RSC / RENDER_DATA / API / HTML）
 *   3. 检查当前 DouyinExtractor 的提取逻辑漏洞
 *   4. 输出详细的诊断报告和修复建议
 *
 * 用法：
 *   node scripts/har-analysis/analyze-har.js <har-file-path> [--aweme-id <id>]
 */

const fs = require("fs");
const path = require("path");

// ── CLI ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { harPath: null, awemeId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--aweme-id" || a === "--id") && i + 1 < argv.length) {
      args.awemeId = argv[++i];
    } else if (!args.harPath && !a.startsWith("-")) {
      args.harPath = a;
    }
  }
  return args;
}

// ── 工具函数 ─────────────────────────────────────────────────────
function pick(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return n.toLocaleString("zh-CN");
}

/**
 * 从 HTML 中精确提取 self.__pace_f.push([1, "..."]) 的字符串参数。
 * 使用字符级扫描处理转义引号。
 */
function extractPaceFPayloads(html) {
  const payloads = [];
  const prefix = 'self.__pace_f.push([1,"';
  let pos = 0;
  while (true) {
    const start = html.indexOf(prefix, pos);
    if (start === -1) break;
    let i = start + prefix.length;
    let escaped = false;
    const chars = [];
    while (i < html.length) {
      const c = html[i];
      if (escaped) {
        chars.push("\\", c);
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        break;
      } else {
        chars.push(c);
      }
      i++;
    }
    if (i < html.length && html[i] === '"') {
      payloads.push(chars.join(""));
    }
    pos = i + 1;
  }
  return payloads;
}

function unescapeJsString(s) {
  const escapes = {
    '\\"': '"',
    "\\\\": "\\",
    "\\n": "\n",
    "\\t": "\t",
    "\\r": "\r",
    "\\b": "\b",
    "\\f": "\f",
    "\\v": "\v",
  };
  return s.replace(/\\(?:["\\ntrbfv]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/g, (match) => {
    const mapped = escapes[match];
    if (mapped !== undefined) return mapped;
    const u = match.match(/\\u([0-9a-fA-F]{4})/);
    if (u) return String.fromCharCode(parseInt(u[1], 16));
    const x = match.match(/\\x([0-9a-fA-F]{2})/);
    if (x) return String.fromCharCode(parseInt(x[1], 16));
    return match;
  });
}

function findJsonObject(text, startIdx) {
  let start = -1;
  let braceCount = 0;
  for (let i = startIdx; i >= 0; i--) {
    if (text[i] === "}") braceCount++;
    if (text[i] === "{") {
      if (braceCount === 0) {
        start = i;
        break;
      }
      braceCount--;
    }
  }
  if (start === -1) return null;

  braceCount = 0;
  let inString = false;
  let escape = false;
  let end = start;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
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
  if (end <= start) return null;

  let jsonStr = text.slice(start, end);
  jsonStr = jsonStr.replace(/"\$undefined"/g, "null").replace(/"\$L\d+"/g, "null");
  jsonStr = jsonStr.replace(/:\$undefined([,}])/g, ":null$1");

  return jsonStr;
}

function tryDecodeBase64Json(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) return null;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (!decoded || decoded.includes("�")) return null;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function formatTimestamp(value) {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n > 100000000000 ? n : n * 1000;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

// ── 分析器 ───────────────────────────────────────────────────────
class HarAnalyzer {
  constructor(harSnapshot, awemeIdHint) {
    this.har = harSnapshot;
    this.awemeIdHint = awemeIdHint || null;
    this.entries = harSnapshot.entries || [];
    this.htmlEntries = this.entries.filter((e) =>
      e.contentType?.includes("text/html") && e.textBody
    );
    this.jsonEntries = this.entries.filter((e) =>
      e.jsonBody || e.textBody
    );
  }

  run() {
    const report = {
      meta: {
        finalUrl: this.har.finalUrl || "unknown",
        awemeIdHint: this.awemeIdHint,
        totalEntries: this.entries.length,
        htmlEntries: this.htmlEntries.length,
        jsonEntries: this.jsonEntries.length,
      },
      sources: {},
      crossValidation: {},
      extractorDiagnosis: {},
      recommendations: [],
    };

    // 1. 各数据源独立提取
    const rsc = this.analyzeRscFlight();
    const render = this.analyzeRenderData();
    const api = this.analyzeApi();
    const html = this.analyzeHtmlFallback();

    report.sources.rscFlight = rsc;
    report.sources.renderData = render;
    report.sources.api = api;
    report.sources.htmlFallback = html;

    // 2. 交叉验证
    report.crossValidation = this.crossValidate([rsc, render, api, html]);

    // 3. 诊断当前 extractor 的漏洞
    report.extractorDiagnosis = this.diagnoseExtractor(rsc, render, api, html);

    // 4. 修复建议
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  // ── RSC flight data ──
  analyzeRscFlight() {
    const result = {
      found: false,
      source: "rsc-flight",
      payloadsFound: 0,
      payloadsParsed: 0,
      matchingDetail: null,
      errors: [],
    };

    for (const entry of this.htmlEntries) {
      const html = entry.textBody || "";
      if (!html.includes("__pace_f")) continue;

      const payloads = extractPaceFPayloads(html);
      result.payloadsFound = payloads.length;

      for (const raw of payloads) {
        let unescaped = unescapeJsString(raw);

        // URL 解码
        if (unescaped.includes("%22") || unescaped.includes("%7B")) {
          try {
            unescaped = decodeURIComponent(unescaped);
          } catch (err) {
            result.errors.push(`decodeURIComponent failed: ${err.message}`);
          }
        }

        const idx = unescaped.indexOf('"awemeId"');
        if (idx === -1) continue;

        const obj = findJsonObject(unescaped, idx);
        if (!obj) {
          result.errors.push("Found 'awemeId' but could not extract JSON object");
          continue;
        }

        try {
          const data = JSON.parse(obj);
          result.payloadsParsed++;

          const detail = data?.aweme?.detail || data?.detail || data;
          if (detail?.awemeId || detail?.aweme_id) {
            const id = String(detail.awemeId || detail.aweme_id);

            if (this.awemeIdHint && id !== this.awemeIdHint) {
              result.errors.push(`RSC detail awemeId mismatch: got ${id}, expected ${this.awemeIdHint}`);
              continue;
            }

            result.found = true;
            result.matchingDetail = {
              awemeId: id,
              structure: this.describeStructure(detail),
              rawKeys: Object.keys(detail),
              stats: this.extractStatsFromDetail(detail),
            };
            break;
          }
        } catch (err) {
          result.errors.push(`JSON parse error: ${err.message}`);
        }
      }

      if (result.found) break;
    }

    return result;
  }

  // ── RENDER_DATA ──
  analyzeRenderData() {
    const result = {
      found: false,
      source: "render-data",
      renderDataBlocks: 0,
      bestMatch: null,
      allCandidates: [],
      errors: [],
    };

    for (const entry of this.htmlEntries) {
      const html = entry.textBody || "";
      const match = html.match(
        /<script\s+id="RENDER_DATA"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i
      );
      if (!match?.[1]) continue;

      result.renderDataBlocks++;

      let decoded = match[1].trim();
      try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
      if (decoded.startsWith("%")) {
        try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
      }

      try {
        const json = JSON.parse(decoded);
        const candidates = this.findAllStatistics(json);
        result.allCandidates.push(...candidates);
      } catch (err) {
        result.errors.push(`RENDER_DATA JSON parse error: ${err.message}`);
      }
    }

    if (result.allCandidates.length > 0) {
      result.found = true;

      if (this.awemeIdHint) {
        const exact = result.allCandidates.filter((c) => c.awemeId === this.awemeIdHint);
        if (exact.length > 0) {
          exact.sort((a, b) => b.score - a.score || b.digg - a.digg);
          result.bestMatch = exact[0];
        } else {
          result.errors.push(`No RENDER_DATA candidate matches awemeId ${this.awemeIdHint}`);
        }
      } else {
        result.allCandidates.sort((a, b) => b.score - a.score || b.digg - a.digg);
        result.bestMatch = result.allCandidates[0];
      }
    }

    return result;
  }

  // ── API 拦截 ──
  analyzeApi() {
    const result = {
      found: false,
      source: "api",
      matchingEntries: 0,
      bestMatch: null,
      allDetails: [],
      errors: [],
    };

    const apiEntries = this.entries.filter((e) =>
      /\/aweme\/v1\/web\/aweme\/(?:detail|post|related)\//i.test(e.url) &&
      (e.jsonBody || e.textBody)
    );

    for (const entry of apiEntries) {
      const data = entry.jsonBody || tryDecodeBase64Json(entry.textBody);
      if (!data || typeof data !== "object") continue;

      result.matchingEntries++;

      // aweme_detail（老视频详情页）
      let detail = data.aweme_detail;
      if (!detail && this.awemeIdHint && Array.isArray(data.aweme_list) && data.aweme_list.length > 0) {
        detail = data.aweme_list.find(
          (a) => String(a.aweme_id || a.awemeId || "") === this.awemeIdHint
        );
      }

      if (!detail) {
        // 记录所有 aweme_list 项的 ID
        if (Array.isArray(data.aweme_list)) {
          const ids = data.aweme_list.map((a) => String(a.aweme_id || a.awemeId || "")).filter(Boolean);
          result.errors.push(`Entry ${entry.url}: aweme_list IDs=[${ids.join(", ")}], none match ${this.awemeIdHint}`);
        }
        continue;
      }

      const id = String(detail.aweme_id || detail.awemeId || "");
      if (this.awemeIdHint && id && id !== this.awemeIdHint) {
        result.errors.push(`API detail awemeId mismatch: got ${id}, expected ${this.awemeIdHint}`);
        continue;
      }

      result.found = true;
      const stats = this.extractStatsFromDetail(detail);
      const info = {
        url: entry.url,
        awemeId: id,
        structure: this.describeStructure(detail),
        rawKeys: Object.keys(detail),
        stats,
      };
      result.allDetails.push(info);

      if (!result.bestMatch || (stats.likes ?? 0) > (result.bestMatch.stats.likes ?? 0)) {
        result.bestMatch = info;
      }
    }

    return result;
  }

  // ── HTML 正则兜底 ──
  analyzeHtmlFallback() {
    const result = {
      found: false,
      source: "html-fallback",
      matches: 0,
      bestMatch: null,
      allMatches: [],
      errors: [],
    };

    for (const entry of this.htmlEntries) {
      const html = entry.textBody || "";
      if (!html) continue;

      if (this.awemeIdHint) {
        // 严格校验 awemeIdHint 仅为数字，防止正则注入
        if (!/^\d+$/.test(this.awemeIdHint)) {
          result.errors.push(`Invalid awemeIdHint: ${this.awemeIdHint}`);
          return result;
        }
        const vidStr = this.awemeIdHint; // 已验证纯数字，无需转义
        const patterns = [
          new RegExp(
            `"${vidStr}"\\s*:\\s*\\{[\\s\\S]{0,2000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`,
            "i"
          ),
          new RegExp(
            `"${vidStr}"[\\s\\S]{0,3000}?"statistics"\\s*:\\s*\\{([^}]+)\\}`,
            "i"
          ),
        ];

        for (const pattern of patterns) {
          const blockMatch = html.match(pattern);
          if (blockMatch?.[1]) {
            result.matches++;
            const block = blockMatch[1];
            const stats = this.extractStatsFromBlock(block);
            result.allMatches.push({ type: "by-awemeId", stats });

            if (!result.bestMatch || (stats.likes ?? 0) > (result.bestMatch.stats?.likes ?? 0)) {
              result.bestMatch = { type: "by-awemeId", stats };
            }

            if (stats.likes !== null || stats.comments !== null || stats.favorites !== null || stats.shares !== null) {
              result.found = true;
            }
          }
        }
      }

      // 全局兜底：限制匹配范围，防止 ReDoS
      const globalMatch = html.match(/"statistics"\s*:\s*\{[^{}]{0,2000}\}/i);
      if (globalMatch?.[1]) {
        result.matches++;
        const stats = this.extractStatsFromBlock(globalMatch[1]);
        result.allMatches.push({ type: "global", stats });

        if (!result.bestMatch || (stats.likes ?? 0) > (result.bestMatch.stats?.likes ?? 0)) {
          result.bestMatch = { type: "global", stats };
        }

        if (stats.likes !== null || stats.comments !== null || stats.favorites !== null || stats.shares !== null) {
          result.found = true;
        }
      }
    }

    return result;
  }

  // ── 辅助提取方法 ──

  describeStructure(obj) {
    if (!obj || typeof obj !== "object") return null;
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        out[key] = "null";
      } else if (Array.isArray(value)) {
        out[key] = `array[${value.length}]`;
      } else if (typeof value === "object") {
        out[key] = `object{${Object.keys(value).join(", ")}}`;
      } else {
        out[key] = typeof value;
      }
    }
    return out;
  }

  extractStatsFromDetail(detail) {
    if (!detail || typeof detail !== "object") return null;

    const apiStats = detail.statistics || {};
    const rscStats = detail.stats || {};
    const stats = {
      digg_count: apiStats.digg_count ?? rscStats.diggCount,
      comment_count: apiStats.comment_count ?? rscStats.commentCount,
      collect_count: apiStats.collect_count ?? rscStats.collectCount,
      share_count: apiStats.share_count ?? rscStats.shareCount,
    };

    const author = detail.author || detail.authorInfo || {};

    return {
      likes: pick(stats.digg_count),
      comments: pick(stats.comment_count),
      favorites: pick(stats.collect_count),
      shares: pick(stats.share_count),
      title: String(detail.desc || "").trim() || null,
      authorName: String(author.nickname || "").trim() || null,
      authorId: String(author.uid || author.short_id || author.user_id || "").trim() || null,
      publishDate: formatTimestamp(detail.create_time ?? detail.createTime),
      rawKeys: Object.keys(detail),
      statisticsKeys: Object.keys(apiStats),
    };
  }

  extractStatsFromBlock(block) {
    const extract = (key) => {
      const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, "i");
      const m = block.match(re);
      return m ? Number(m[1]) : null;
    };

    return {
      likes: extract("digg_count"),
      comments: extract("comment_count"),
      favorites: extract("collect_count"),
      shares: extract("share_count"),
    };
  }

  findAllStatistics(obj) {
    const candidates = [];

    const walk = (o, depth) => {
      if (!o || typeof o !== "object" || depth > 8) return;

      if (
        o.statistics &&
        typeof o.statistics === "object" &&
        ("digg_count" in o.statistics || "comment_count" in o.statistics)
      ) {
        const s = o.statistics;
        candidates.push({
          likes: pick(s.digg_count ?? s.like_count),
          comments: pick(s.comment_count),
          favorites: pick(s.collect_count ?? s.favorite_count),
          shares: pick(s.share_count),
          title: String(o.desc || o.title || "").trim(),
          authorName: String(o.author?.nickname || o.authorInfo?.nickname || "").trim(),
          authorId: String(o.author?.uid || o.authorInfo?.uid || "").trim(),
          publishDate: formatTimestamp(o.create_time ?? o.createTime),
          score: [pick(s.digg_count), pick(s.comment_count), pick(s.collect_count), pick(s.share_count)].filter(
            (v) => v !== null
          ).length,
          digg: Number(s.digg_count || 0),
          awemeId: String(o.aweme_id || o.awemeId || ""),
        });
      }

      for (const v of Object.values(o)) walk(v, depth + 1);
    };

    walk(obj, 0);
    return candidates;
  }

  // ── 交叉验证 ──
  crossValidate(sources) {
    const allMetrics = [];
    for (const src of sources) {
      if (src.found && src.bestMatch) {
        const stats =
          src.bestMatch.stats ||
          (src.matchingDetail ? this.extractStatsFromDetail(src.matchingDetail) : null);
        if (stats) {
          allMetrics.push({
            source: src.source,
            likes: stats.likes,
            comments: stats.comments,
            favorites: stats.favorites,
            shares: stats.shares,
          });
        }
      }
    }

    // 一致性检查
    const issues = [];
    if (allMetrics.length >= 2) {
      const likes = allMetrics.map((m) => m.likes).filter((v) => v !== null);
      if (likes.length >= 2) {
        const unique = [...new Set(likes)];
        if (unique.length > 1) {
          issues.push({
            type: "inconsistent-likes",
            values: allMetrics.map((m) => ({ source: m.source, value: m.likes })),
          });
        }
      }
    }

    return {
      totalSources: sources.length,
      sourcesWithData: allMetrics.length,
      metrics: allMetrics,
      issues,
      overall: issues.length === 0 ? "consistent" : "inconsistent",
    };
  }

  // ── 诊断当前 extractor ──
  diagnoseExtractor(rsc, render, api, html) {
    const diagnosis = {
      rscFlight: this.diagnoseRsc(rsc),
      renderData: this.diagnoseRender(render),
      api: this.diagnoseApi(api),
      htmlFallback: this.diagnoseHtml(html),
      rootCause: null,
    };

    // 根因分析
    if (!rsc.found && !render.found && !api.found && !html.found) {
      diagnosis.rootCause = "ALL_SOURCES_EMPTY: 所有数据源均未找到指标。可能原因：页面未正确加载、网络响应被拦截器排除、或页面结构已完全改变。";
    } else if (!rsc.found && !render.found && !api.found && html.found) {
      diagnosis.rootCause = "ONLY_HTML_FALLBACK: 只有 HTML 正则兜底能找到数据，说明 API 和 SSR 数据未正确注入。可能原因：抖音改版导致数据结构变更，或拦截器未捕获目标 API。";
    } else if (!rsc.found && render.found && !api.found) {
      diagnosis.rootCause = "RENDER_DATA_ONLY: 只有 RENDER_DATA 有数据。如果 extractor 没取到，可能是 RENDER_DATA 的解析逻辑有问题（解码层数不够、JSON 结构变更）。";
    } else if (rsc.found && !render.found && !api.found) {
      diagnosis.rootCause = "RSC_ONLY: 只有 RSC flight data 有数据。如果 extractor 没取到，可能是 __pace_f payload 的提取/解析有问题，或 awemeId 匹配逻辑错误。";
    } else if (api.found) {
      diagnosis.rootCause = "API_OK: API 响应有数据但 extractor 可能未提取。检查 API 匹配正则是否覆盖此 URL 格式，或 extractor 中的 awemeId 过滤过严。";
    }

    return diagnosis;
  }

  diagnoseRsc(rsc) {
    const issues = [];
    if (!rsc.found && rsc.payloadsFound > 0) {
      issues.push(`找到 ${rsc.payloadsFound} 个 __pace_f payload 但无法解析出含 awemeId 的数据`);
    }
    if (rsc.matchingDetail) {
      const stats = this.extractStatsFromDetail(rsc.matchingDetail);
      if (stats.likes === null && stats.comments === null && stats.favorites === null && stats.shares === null) {
        issues.push("RSC detail 找到但 statistics/stats 字段全空");
      }
    }
    return { issues, rawResult: rsc };
  }

  diagnoseRender(render) {
    const issues = [];
    if (!render.found && render.renderDataBlocks > 0) {
      issues.push(`找到 ${render.renderDataBlocks} 个 RENDER_DATA 块但无含 statistics 的数据`);
    }
    if (render.bestMatch) {
      const m = render.bestMatch;
      if (m.likes === null && m.comments === null && m.favorites === null && m.shares === null) {
        issues.push("RENDER_DATA bestMatch 但指标全空");
      }
    }
    return { issues, rawResult: render };
  }

  diagnoseApi(api) {
    const issues = [];
    if (!api.found && api.matchingEntries > 0) {
      issues.push(`找到 ${api.matchingEntries} 个 API 响应但无匹配 awemeId 的 detail`);
    }
    return { issues, rawResult: api };
  }

  diagnoseHtml(html) {
    const issues = [];
    if (!html.found && html.matches > 0) {
      issues.push(`正则匹配 ${html.matches} 次但 statistics 块中无数字字段`);
    }
    return { issues, rawResult: html };
  }

  // ── 修复建议 ──
  generateRecommendations(report) {
    const recs = [];

    const { rscFlight, renderData, api, htmlFallback } = report.sources;

    // RSC 相关
    if (rscFlight.payloadsFound > 0 && !rscFlight.found) {
      recs.push({
        priority: "HIGH",
        area: "RSC flight data",
        issue: "payload 存在但无法提取有效数据",
        fix: "检查 __pace_f payload 的解码逻辑。当前逻辑：unescapeJsString → 可能的 decodeURIComponent → findJsonObject → JSON.parse。可能需要：1) 增加 URL 解码层数；2) 检查 findJsonObject 的边界是否正确；3) 放宽 awemeId 匹配条件。",
      });
    }

    // RENDER_DATA 相关
    if (renderData.renderDataBlocks > 0 && !renderData.found) {
      recs.push({
        priority: "HIGH",
        area: "RENDER_DATA",
        issue: "RENDER_DATA 块存在但无 statistics 数据",
        fix: "1) 检查 RENDER_DATA 中指标字段名是否已变更（如 digg_count → diggCount）；2) 检查指标是否在 RENDER_DATA 之外的其他字段中；3) 打印完整的 RENDER_DATA JSON 结构进行人工审查。",
      });
    }

    // API 相关
    if (api.matchingEntries > 0 && !api.found) {
      recs.push({
        priority: "HIGH",
        area: "API interception",
        issue: "API 响应存在但无匹配 awemeId 的 detail",
        fix: "1) 检查 API 返回的数据结构是否变更（如 aweme_detail 改名）；2) 检查 aweme_list 中的字段名（aweme_id vs awemeId）；3) 如果实际返回的数据中没有 awemeId，放宽 awemeIdHint 匹配条件或改为第一个可用数据。",
      });
    }

    // HTML 兜底
    if (htmlFallback.matches > 0 && !htmlFallback.found) {
      recs.push({
        priority: "MEDIUM",
        area: "HTML fallback",
        issue: "正则匹配到 statistics 块但字段名可能已变更",
        fix: "检查 statistics 块中的实际字段名，可能已从 digg_count/comment_count/collect_count/share_count 变为其他命名。",
      });
    }

    // 如果所有源都空
    if (!rscFlight.found && !renderData.found && !api.found && !htmlFallback.found) {
      recs.push({
        priority: "CRITICAL",
        area: "network capture",
        issue: "所有数据源均无指标",
        fix: "1) 检查 HAR 收集器是否正确记录了所有网络响应（resourceType 过滤可能过严）；2) 检查是否有新的 API 端点或数据下发方式；3) 考虑使用 page.evaluate 读取 window.__INITIAL_STATE__ 或 __pace_f 全局变量作为补充。",
      });
    }

    return recs;
  }
}

// ── 报告格式化 ────────────────────────────────────────────────────
function formatReport(report) {
  const lines = [];
  lines.push("=".repeat(70));
  lines.push(" 抖音帖子 HAR 分析报告");
  lines.push("=".repeat(70));
  lines.push("");

  // 元信息
  lines.push("## 元信息");
  lines.push(`- 最终 URL: ${report.meta.finalUrl}`);
  lines.push(`- awemeId 提示: ${report.meta.awemeIdHint || "N/A"}`);
  lines.push(`- 总条目数: ${report.meta.totalEntries}`);
  lines.push(`- HTML 条目: ${report.meta.htmlEntries}`);
  lines.push(`- JSON 条目: ${report.meta.jsonEntries}`);
  lines.push("");

  // 各数据源结果
  for (const [name, source] of Object.entries(report.sources)) {
    lines.push(`## ${name.toUpperCase()}`);
    lines.push(`- 找到数据: ${source.found ? "✅ 是" : "❌ 否"}`);

    if (name === "rscFlight") {
      lines.push(`- __pace_f payloads: ${source.payloadsFound} 个`);
      lines.push(`- 成功解析: ${source.payloadsParsed} 个`);
      if (source.matchingDetail) {
        const stats = source.matchingDetail.stats;
        lines.push(`- awemeId: ${source.matchingDetail.awemeId}`);
        lines.push(`- 标题: ${stats.title || "N/A"}`);
        lines.push(`- 点赞: ${formatNumber(stats.likes)}`);
        lines.push(`- 评论: ${formatNumber(stats.comments)}`);
        lines.push(`- 收藏: ${formatNumber(stats.favorites)}`);
        lines.push(`- 分享: ${formatNumber(stats.shares)}`);
        lines.push(`- 作者: ${stats.authorName || "N/A"}`);
        lines.push(`- 发布日期: ${stats.publishDate || "N/A"}`);
      }
    } else if (name === "renderData") {
      lines.push(`- RENDER_DATA 块: ${source.renderDataBlocks} 个`);
      if (source.bestMatch) {
        const m = source.bestMatch;
        lines.push(`- awemeId: ${m.awemeId || "N/A"}`);
        lines.push(`- 标题: ${m.title || "N/A"}`);
        lines.push(`- 点赞: ${formatNumber(m.likes)}`);
        lines.push(`- 评论: ${formatNumber(m.comments)}`);
        lines.push(`- 收藏: ${formatNumber(m.favorites)}`);
        lines.push(`- 分享: ${formatNumber(m.shares)}`);
      }
      lines.push(`- 总候选: ${source.allCandidates.length} 个`);
    } else if (name === "api") {
      lines.push(`- 匹配 API 条目: ${source.matchingEntries} 个`);
      if (source.bestMatch) {
        const m = source.bestMatch;
        lines.push(`- URL: ${m.url}`);
        lines.push(`- awemeId: ${m.awemeId || "N/A"}`);
        lines.push(`- 标题: ${m.stats.title || "N/A"}`);
        lines.push(`- 点赞: ${formatNumber(m.stats.likes)}`);
        lines.push(`- 评论: ${formatNumber(m.stats.comments)}`);
        lines.push(`- 收藏: ${formatNumber(m.stats.favorites)}`);
        lines.push(`- 分享: ${formatNumber(m.stats.shares)}`);
      }
      lines.push(`- 总详情数: ${source.allDetails.length} 个`);
    } else if (name === "htmlFallback") {
      lines.push(`- 正则匹配: ${source.matches} 次`);
      if (source.bestMatch) {
        const s = source.bestMatch.stats;
        lines.push(`- 类型: ${source.bestMatch.type}`);
        lines.push(`- 点赞: ${formatNumber(s.likes)}`);
        lines.push(`- 评论: ${formatNumber(s.comments)}`);
        lines.push(`- 收藏: ${formatNumber(s.favorites)}`);
        lines.push(`- 分享: ${formatNumber(s.shares)}`);
      }
    }

    if (source.errors?.length) {
      lines.push("- 错误:");
      for (const err of source.errors.slice(0, 5)) {
        lines.push(`  * ${err}`);
      }
      if (source.errors.length > 5) {
        lines.push(`  * ... 还有 ${source.errors.length - 5} 条错误`);
      }
    }

    lines.push("");
  }

  // 交叉验证
  lines.push("## 交叉验证");
  const cv = report.crossValidation;
  lines.push(`- 有数据的数据源: ${cv.sourcesWithData}/${cv.totalSources}`);
  lines.push(`- 一致性: ${cv.overall}`);
  if (cv.metrics.length > 0) {
    lines.push("- 各源指标:");
    for (const m of cv.metrics) {
      lines.push(
        `  ${m.source}: 赞${formatNumber(m.likes)} 评${formatNumber(m.comments)} 藏${formatNumber(
          m.favorites
        )} 转${formatNumber(m.shares)}`
      );
    }
  }
  if (cv.issues.length) {
    lines.push("- 不一致问题:");
    for (const issue of cv.issues) {
      lines.push(`  * ${issue.type}`);
      for (const v of issue.values) {
        lines.push(`    - ${v.source}: ${formatNumber(v.value)}`);
      }
    }
  }
  lines.push("");

  // 诊断
  lines.push("## Extractor 诊断");
  const diag = report.extractorDiagnosis;
  if (diag.rootCause) {
    lines.push(`根因: ${diag.rootCause}`);
  }
  lines.push("");

  // 修复建议
  lines.push("## 修复建议");
  for (const rec of report.recommendations) {
    lines.push(`[${rec.priority}] ${rec.area}`);
    lines.push(`  问题: ${rec.issue}`);
    lines.push(`  修复: ${rec.fix}`);
    lines.push("");
  }

  lines.push("=".repeat(70));
  lines.push(" 报告结束");
  lines.push("=".repeat(70));

  return lines.join("\n");
}

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (!args.harPath || !fs.existsSync(args.harPath)) {
    console.error("用法: node analyze-har.js <har-file> [--aweme-id <id>]");
    console.error("示例: node analyze-har.js output/captured-har.json");
    process.exit(1);
  }

  console.log(`[analyze-har] 加载 HAR: ${args.harPath}`);
  let harSnapshot;
  try {
    const raw = fs.readFileSync(args.harPath, "utf8");
    harSnapshot = JSON.parse(raw);
  } catch (err) {
    console.error(`[analyze-har] 读取/解析 HAR 失败: ${err.message}`);
    process.exit(1);
  }

  // 从 URL 提取 awemeId（如果没有提供）
  let awemeId = args.awemeId;
  if (!awemeId && harSnapshot.finalUrl) {
    const m = harSnapshot.finalUrl.match(/\/video\/(\d+)/) || harSnapshot.finalUrl.match(/\/note\/(\d+)/);
    if (m) awemeId = m[1];
  }

  console.log(`[analyze-har] awemeId: ${awemeId || "(未自动提取)"}`);

  const analyzer = new HarAnalyzer(harSnapshot, awemeId);
  const report = analyzer.run();

  // 输出报告
  const formatted = formatReport(report);
  console.log(formatted);

  // 保存 JSON 版本
  const reportPath = args.harPath.replace(/\.json$/, "-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[analyze-har] 完整报告已保存: ${reportPath}`);
}

main().catch((err) => {
  console.error("[analyze-har] 错误:", err);
  process.exit(1);
});
