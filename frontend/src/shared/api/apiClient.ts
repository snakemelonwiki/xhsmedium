import type { PagedResult, PageQuery } from '@/shared/types/pagination';

export class AuthExpiredError extends Error {
  constructor(message = '登录已失效，请重新登录') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null;
  clearToken?: () => void;
  fetcher?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: PageQuery;
  body?: BodyInit | Record<string, unknown> | null;
}

const TOKEN_KEY = 'xhsmedium.token';

function defaultGetToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function defaultClearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem('xhsmedium.user');
}

function appendQuery(url: URL, query?: PageQuery): void {
  if (!query) return;
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function normalizePagedResult<T>(payload: unknown): PagedResult<T> {
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length, page: 1, pageSize: payload.length };
  }

  const data = (payload ?? {}) as Partial<PagedResult<T>> & {
    items?: T[];
    total?: number;
    limit?: number;
    offset?: number;
  };
  const items = Array.isArray(data.items) ? data.items : [];
  const total = Number(data.total ?? items.length);
  const pageSize = Number(data.pageSize ?? data.limit ?? (items.length || 20));
  const page = Number(data.page ?? (data.offset !== undefined ? Math.floor(Number(data.offset) / pageSize) + 1 : 1));

  return { items, total, page, pageSize };
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '/api';
  const fetcher = options.fetcher ?? fetch;
  const getToken = options.getToken ?? defaultGetToken;
  const clearToken = options.clearToken ?? defaultClearToken;

  async function request<T>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, 'http://xhsmedium.local');
    appendQuery(url, requestOptions.query);

    const headers = new Headers(requestOptions.headers);
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let body = requestOptions.body as BodyInit | undefined;
    if (body && !(body instanceof FormData) && typeof body !== 'string' && !(body instanceof URLSearchParams)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    const response = await fetcher(`${url.pathname}${url.search}`, {
      ...requestOptions,
      headers,
      body,
    });

    if (response.status === 401) {
      // 401 不再立即 clearToken：先尝试一次 /auth/refresh 续签并重放原请求。
      // 仅 refresh 也失败时才视为"登录已失效"并清 token。
      // 这样可以避免主管长时间停留 dashboard → token 自然过期 → 选员工触发 401 → 被踢下线。
      // 注意：body 此时已被 JSON.stringify 改写，可直接复用；
      //       但 requestOptions 是原始对象，不能 spread（避免覆盖 stringify 后的 body）。
      const retryBody = body;
      const refreshed = await tryRefreshAndRetry(() =>
        fetcher(`${url.pathname}${url.search}`, {
          method: requestOptions.method,
          headers: withBearer(getToken()),
          body: retryBody,
        }),
      );
      if (refreshed.ok) {
        return refreshed.payload as T;
      }
      clearToken();
      throw new AuthExpiredError();
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      // 403 优先用后端的 reason 字段（比裸 message 'forbidden' 更有信息量）
      const payloadObj = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
      const reason = payloadObj && typeof payloadObj.reason === 'string' ? String(payloadObj.reason) : '';
      const message =
        reason ||
        (payloadObj && 'message' in payloadObj ? String(payloadObj.message) : `请求失败：${response.status}`);
      throw new Error(message);
    }

    return payload as T;
  }

  return {
    request,
    get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: RequestOptions['body'], options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(path: string, body?: RequestOptions['body'], options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),
    delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
  };
}

/**
 * 401 续签流程：
 *   1. 并发去重：同一 token 同一时间只允许一个 refresh 请求在跑，其他 401 等待它完成
 *   2. refresh 成功 → 把新 token 写回 localStorage → 用新 token 重放原请求
 *   3. refresh 失败 → 通知上层 clearToken + 抛 AuthExpiredError
 *
 * 注意：refresh 失败时**不**在这里 clearToken；由调用方决定（避免把"已登出"和"网络抖
 * 动导致 refresh 失败"混为一谈，让用户在 dashboard 看到友好提示）。
 */
let inFlightRefresh: Promise<boolean> | null = null;

async function tryRefreshAndRetry(retry: () => Promise<Response>): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  try {
    if (!inFlightRefresh) {
      inFlightRefresh = doRefresh();
    }
    const refreshed = await inFlightRefresh;
    if (!refreshed) return { ok: false };
    const replay = await retry();
    if (replay.status === 401) return { ok: false };
    const payload = await parseResponse(replay);
    if (!replay.ok) {
      // 续签后重放仍非 2xx：当成"业务错误"抛出去，让调用方处理
      const payloadObj = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
      const reason = payloadObj && typeof payloadObj.reason === 'string' ? String(payloadObj.reason) : '';
      const message =
        reason ||
        (payloadObj && 'message' in payloadObj ? String(payloadObj.message) : `请求失败：${replay.status}`);
      throw new Error(message);
    }
    return { ok: true, payload };
  } finally {
    // 不在这里清 inFlightRefresh：成功的请求在同 tick 可能已经回来了，但
    // 下次新的 401 应该再走一次 refresh（如果 token 真的又过期了）。
    // 把清空挪到 doRefresh 内部：resolve/reject 一次后下次重新发起。
  }
}

async function doRefresh(): Promise<boolean> {
  const token = defaultGetToken();
  if (!token) return false;
  try {
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return false;
    const data = (await parseResponse(resp)) as { token?: string } | null;
    const newToken = data && typeof data === 'object' ? (data as any).token : null;
    if (typeof newToken !== 'string' || !newToken) return false;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_KEY, newToken);
    }
    return true;
  } catch {
    return false;
  } finally {
    // 让下一次 401 重新发起 refresh
    queueMicrotask(() => {
      inFlightRefresh = null;
    });
  }
}

function withBearer(token: string | null): Headers {
  const h = new Headers();
  if (token) h.set('Authorization', `Bearer ${token}`);
  return h;
}

export const apiClient = createApiClient();
