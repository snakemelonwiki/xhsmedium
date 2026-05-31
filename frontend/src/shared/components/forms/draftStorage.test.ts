import { describe, expect, it } from 'vitest';

import { clearDraft, loadDraft, saveDraft } from './draftStorage';

describe('draft storage', () => {
  it('saves, loads and clears form values', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    saveDraft('lead-new', { nickname: '小王', ip: '上海' }, storage);
    expect(loadDraft('lead-new', storage)).toEqual({ nickname: '小王', ip: '上海' });

    clearDraft('lead-new', storage);
    expect(loadDraft('lead-new', storage)).toBeUndefined();
  });
});
