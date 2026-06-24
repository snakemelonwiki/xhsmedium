import type { Page, Response } from 'playwright';
import { HarEntry, HarSnapshot } from './types';

/**
 * HAR（HTTP Archive）监听器
 *
 * 核心职责：
 *   1. 在 Playwright page 上挂载网络响应拦截器
 *   2. 收集所有网络请求的响应内容
 *   3. 自动解析 JSON 响应（含抖音 base64 包装 JSON）
 *   4. 按平台 / URL 模式过滤无关请求（图片、CSS、字体等）
 *   5. 生成结构化的 HAR 快照供数据提取器消费
 *
 * 与旧版 metricsFetcher.js 的区别：
 *   - 旧版：page.on('response', ...) 只拦截特定 API（feed API、aweme/detail），
 *          数据分散在平台各自的 interceptor 函数中，耦合严重。
 *   - 新版：统一收集所有请求，数据提取器按需筛选，解耦平台逻辑。
 */
export class HarListener {
  private entries: HarEntry[] = [];
  private startedAt = 0;
  private finishedAt = 0;
  private started = false;
  private readonly defaultExcludeTypes = new Set([
    'image', 'stylesheet', 'font', 'media', 'websocket', 'eventsource',
  ]);
  private readonly handler: (response: Response) => void;

  constructor(
    private readonly page: Page,
    private readonly options: {
      /** 只记录匹配这些 URL 模式的请求（默认全部） */
      urlFilter?: RegExp[];
      /** 排除这些资源类型 */
      excludeResourceTypes?: Set<string>;
      /** 最大条目数（防止内存泄漏） */
      maxEntries?: number;
    } = {},
  ) {
    this.handler = (response: Response) => {
      this.onResponse(response).catch(() => {});
    };
  }

  /**
   * 开始监听网络响应
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.startedAt = Date.now();
    this.page.on('response', this.handler);
  }

  /**
   * 停止监听并返回 HAR 快照
   */
  stop(): HarSnapshot {
    this.page.off('response', this.handler);
    this.started = false;
    this.finishedAt = Date.now();
    return {
      entries: [...this.entries],
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  /**
   * 获取当前已收集的条目（不停止监听）
   */
  getCurrentEntries(): HarEntry[] {
    return [...this.entries];
  }

  /**
   * 清空已收集的条目
   */
  clear(): void {
    this.entries = [];
  }

  private async onResponse(response: Response): Promise<void> {
    const url = response.url();
    const request = response.request();

    const status = response.status();
    let contentType = '';
    try {
      contentType = (response.headers()['content-type'] || '').toLowerCase();
    } catch {
      // 忽略 header 读取失败
    }

    // 排除静态资源（图片/CSS/字体/WebSocket）
    const resourceType = request.resourceType();
    const excludeTypes = this.options.excludeResourceTypes || this.defaultExcludeTypes;
    if (excludeTypes.has(resourceType)) return;

    // URL 过滤：HTML 文档总是记录，因为可能包含 SSR / RSC 数据
    if (this.options.urlFilter?.length && !contentType.includes('text/html')) {
      const matches = this.options.urlFilter.some((re) => re.test(url));
      if (!matches) return;
    }

    // 最大条目数限制
    const max = this.options.maxEntries || 200;
    if (this.entries.length >= max) return;

    const entry: HarEntry = {
      url,
      method: request.method(),
      status,
      contentType,
      headers: {},
      timestamp: Date.now(),
    };

    // 尝试读取响应体
    if (status >= 200 && status < 300 && contentType.includes('application/json')) {
      try {
        entry.jsonBody = await response.json();
      } catch {
        // JSON 解析失败，尝试读取文本（可能是 base64 编码）
        try {
          const text = await response.text();
          entry.textBody = text;
          entry.jsonBody = this.tryDecodeBase64Json(text);
        } catch {
          // 忽略读取失败
        }
      }
    } else if (status >= 200 && status < 300 && contentType.includes('text/html')) {
      try {
        entry.textBody = await response.text();
      } catch {
        // 忽略读取失败
      }
    }

    // 收集响应头
    try {
      const headers = response.headers();
      for (const [key, value] of Object.entries(headers)) {
        entry.headers[key.toLowerCase()] = String(value);
      }
    } catch {
      // 忽略 header 读取失败
    }

    this.entries.push(entry);
  }

  /**
   * 尝试将 base64 编码的 JSON 字符串解码为对象。
   * 抖音部分 API（如 /aweme/v1/web/aweme/post/）返回 base64 编码的 JSON。
   */
  private tryDecodeBase64Json(text: string): any | null {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    // 简单判断是否为 base64：长度是 4 的倍数，且只含 base64 字符
    if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length % 4 !== 0) return null;
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      if (!decoded || decoded.includes('�')) return null;
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}
