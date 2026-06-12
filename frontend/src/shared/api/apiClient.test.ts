import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApiClient, normalizePagedResult } from './apiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

function tokenFor(userId: string): string {
  const payload = btoa(JSON.stringify({ sub: userId, username: userId, role: 'admin' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function stubWindowStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  const target = new EventTarget();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
    dispatchEvent: target.dispatchEvent.bind(target),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
  return data;
}

describe('normalizePagedResult', () => {
  it('keeps page shaped responses unchanged', () => {
    expect(normalizePagedResult({ items: ['a'], total: 1, page: 2, pageSize: 10 })).toEqual({
      items: ['a'],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('converts legacy offset pagination to page pagination', () => {
    expect(normalizePagedResult({ items: ['a', 'b'], total: 30, limit: 10, offset: 20 })).toEqual({
      items: ['a', 'b'],
      total: 30,
      page: 3,
      pageSize: 10,
    });
  });

  it('wraps plain arrays as a first page result', () => {
    expect(normalizePagedResult(['a', 'b'])).toEqual({
      items: ['a', 'b'],
      total: 2,
      page: 1,
      pageSize: 2,
    });
  });

  it('ignores refreshed tokens that belong to a different stored user', async () => {
    const oldToken = tokenFor('admin-1');
    const otherUserToken = tokenFor('academic-1');
    const storage = stubWindowStorage({
      'xhsmedium.token': oldToken,
      'xhsmedium.user': JSON.stringify({ id: 'admin-1', name: 'admin2', role: 'admin' }),
    });
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'X-New-Token': otherUserToken },
      }),
    );
    const client = createApiClient({ fetcher: fetcher as unknown as typeof fetch });

    await client.get('/employees');

    expect(storage.get('xhsmedium.token')).toBe(oldToken);
  });

  it('stores refreshed tokens that match the current stored user', async () => {
    const oldToken = tokenFor('admin-1');
    const newToken = tokenFor('admin-1');
    const storage = stubWindowStorage({
      'xhsmedium.token': oldToken,
      'xhsmedium.user': JSON.stringify({ id: 'admin-1', name: 'admin2', role: 'admin' }),
    });
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'X-New-Token': newToken },
      }),
    );
    const client = createApiClient({ fetcher: fetcher as unknown as typeof fetch });

    await client.get('/employees');

    expect(storage.get('xhsmedium.token')).toBe(newToken);
  });
});
