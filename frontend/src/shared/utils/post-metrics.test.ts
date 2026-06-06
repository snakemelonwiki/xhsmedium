import { describe, expect, it } from 'vitest';

import { normalizePostMetric } from './post-metrics';

describe('normalizePostMetric', () => {
  it('keeps valid metric values unchanged', () => {
    expect(normalizePostMetric(12)).toBe(12);
    expect(normalizePostMetric('7')).toBe(7);
  });

  it('falls back negative and invalid metric values to zero', () => {
    expect(normalizePostMetric(-3)).toBe(0);
    expect(normalizePostMetric(Number.NaN)).toBe(0);
    expect(normalizePostMetric('bad')).toBe(0);
  });
});
