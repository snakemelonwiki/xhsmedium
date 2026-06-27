import { describe, expect, it } from 'vitest';

import { getOperationRankingMetricKeys, MAIN_RANKING_TYPE_OPTIONS } from './rankingTable';

describe('operation ranking table model', () => {
  it('keeps one merged ranking with only lead/post sort toggles', () => {
    expect(MAIN_RANKING_TYPE_OPTIONS).toEqual([
      { label: '按作品', value: 'posts' },
      { label: '按客资', value: 'leads' },
    ]);
  });

  it('uses different metric keys for each sort mode', () => {
    expect(getOperationRankingMetricKeys('posts')).toEqual([
      'accountCount',
      'postCount',
      'xhsPostCount',
      'douyinPostCount',
      'todayDeals',
    ]);
    expect(getOperationRankingMetricKeys('leads')).toEqual([
      'accountCount',
      'leadCount',
      'xhsLeadCount',
      'douyinLeadCount',
      'todayDeals',
    ]);
    expect(getOperationRankingMetricKeys('traffic')).toEqual([
      'accountCount',
      'traffic',
      'xhsTraffic',
      'douyinTraffic',
      'todayDeals',
    ]);
  });
});
