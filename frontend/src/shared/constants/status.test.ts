import { describe, expect, it } from 'vitest';

import { getStatusMeta, normalizeStatusCode } from './status';

describe('status lookup', () => {
  it('returns canonical lead status metadata', () => {
    expect(getStatusMeta('leadStatus', 'in_collaboration')).toMatchObject({
      code: 'in_collaboration',
      label: '协同中',
      role: 'operation',
    });
  });

  it('normalizes legacy lead status aliases', () => {
    expect(normalizeStatusCode('leadStatus', 'in_collab')).toBe('in_collaboration');
    expect(normalizeStatusCode('leadStatus', 'contact_added')).toBe('added_success');
  });

  it('normalizes legacy add and process aliases', () => {
    expect(normalizeStatusCode('addStatus', 'pending')).toBe('waiting_pass');
    expect(normalizeStatusCode('addStatus', 'rejected')).toBe('not_passed');
    expect(normalizeStatusCode('processStatus', 'chatting')).toBe('communicating');
    expect(normalizeStatusCode('processStatus', 'closed')).toBe('deal_done');
  });
});
