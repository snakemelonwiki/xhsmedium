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
      clearToken();
      throw new AuthExpiredError();
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'message' in payload ? String(payload.message) : `请求失败：${response.status}`;
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

export const apiClient = createApiClient();
