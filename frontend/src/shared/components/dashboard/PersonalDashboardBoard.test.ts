import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  buildPersonalDashboardRangeQuery,
  getOverviewCardKeys,
  type OverviewMetricMode,
} from './PersonalDashboardBoard';

describe('PersonalDashboardBoard helpers', () => {
  it('serializes the shared QuickRangePicker value to from/to query params', () => {
    const range = {
      start: dayjs('2026-05-01T12:34:00'),
      end: dayjs('2026-05-31T23:59:00'),
    };

    expect(buildPersonalDashboardRangeQuery(range)).toEqual({
      period: undefined,
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });

  it('falls back to the legacy month period when the shared range is empty', () => {
    expect(buildPersonalDashboardRangeQuery(null)).toEqual({
      period: 'month',
      from: undefined,
      to: undefined,
    });
  });

  it.each<[OverviewMetricMode, string[]]>([
    ['traffic', ['monthPostCount', 'monthTraffic', 'monthLeadPostCount']],
    ['leads', ['monthLeadCount', 'monthLeadPostCount', 'totalLeads']],
  ])('keeps overview cards focused for %s mode', (mode, expectedKeys) => {
    expect(getOverviewCardKeys(mode)).toEqual(expectedKeys);
  });
});
