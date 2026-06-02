import { describe, expect, it } from 'vitest';

import { buildRankingExportFilter } from './exportFilter';

describe('buildRankingExportFilter', () => {
  it('keeps current ranking filters and omits empty platform', () => {
    expect(buildRankingExportFilter({ type: 'posts', period: '7d', platform: '' })).toEqual({
      type: 'posts',
      period: '7d',
    });
  });

  it('includes selected platform for rankings export', () => {
    expect(buildRankingExportFilter({ type: 'leads', period: '30d', platform: 'xhs' })).toEqual({
      type: 'leads',
      period: '30d',
      platform: 'xhs',
    });
  });
});
