import { describe, expect, it } from 'vitest';

import { normalizePagedResult } from './apiClient';

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
});
