import type { PagedResult, PageQuery } from '@/shared/types/pagination';
import { notifyAuthChanged, readTokenUserId, STORAGE_KEYS, type AppUser } from '@/shared/auth/auth';

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

const TOKEN_KEY = STORAGE_KEYS.token;

let authClearedController: AbortController | null = null;

function defaultGetToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function defaultClearToken(): void {
  if (typeof window === 'undefined') return;
  // Abort all pending requests from the previous session to prevent
  // stale in-flight requests (e.g. notification polling) from
  // triggering refresh with a revoked token
  if (authClearedController) {
    authClearedController.abort();
  }
  authClearedController = new AbortController();
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(STORAGE_KEYS.user);
  notifyAuthChanged();
}

function getStoredUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

function isTokenForStoredUser(token: string): boolean {
  const user = getStoredUser();
  if (!user?.id) return true;
  const tokenUserId = readTokenUserId(token);
  return String(tokenUserId || '') === String(user.id);
}

function persistRefreshedToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (!isTokenForStoredUser(token)) {
    console.warn('[apiClient] ignored refreshed token for a different user');
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
  notifyAuthChanged();
}

function appendQuery(url: URL, query?: PageQuery): void {
  if (!query) return;
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      // 数组 → 重复同名 query 参数（?status=completed&status=closed），
      // 便于后端 @Query('status') status?: string | string[] 直接接到数组。
      const filtered = value.filter((v) => v !== undefined && v !== null && v !== '');
      filtered.forEach((v) => url.searchParams.append(key, String(v)));
      return;
    }
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
      signal: authClearedController?.signal,
    });

    // 消费后端 TokenRefreshInterceptor 自动续期的 X-New-Token 响应头
    const newToken = response.headers.get('X-New-Token');
    if (newToken && typeof window !== 'undefined') {
      persistRefreshedToken(newToken);
    }

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
      // 调试日志
      console.error('[apiClient] Request failed:', {
        url: `${url.pathname}${url.search}`,
        status: response.status,
        payload,
      });

      // 403 优先用后端的 reason 字段（比裸 message 'forbidden' 更有信息量）
      const payloadObj = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : null;
      const reason = payloadObj && typeof payloadObj.reason === 'string' ? String(payloadObj.reason) : '';
      const message =
        reason ||
        (payloadObj && 'message' in payloadObj ? String(payloadObj.message) : `请求失败：${response.status}`);

      console.error('[apiClient] Throwing error:', message);
      throw new Error(message);
    }

    return payload as T;
  }

  return {
    request,
    get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: RequestOptions['body'], options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),
    put: <T>(path: string, body?: RequestOptions['body'], options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PUT', body }),
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
  // 如果在 refresh 过程中 token 已经被清除了（例如 logout 后切换账号），
  // 立即返回 false，避免用旧 token refresh 成功后再写回 localStorage
  if (authClearedController?.signal.aborted) return false;
  try {
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return false;
    const data = (await parseResponse(resp)) as { token?: string } | null;
    const newToken = data && typeof data === 'object' ? (data as any).token : null;
    if (typeof newToken !== 'string' || !newToken) return false;
    persistRefreshedToken(newToken);
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
