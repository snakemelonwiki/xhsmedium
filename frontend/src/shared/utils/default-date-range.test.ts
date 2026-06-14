import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';

import { buildTodayDateParams, buildTodayDateRange, todayDateString } from './default-date-range';

describe('default date range', () => {
  it('uses the current local day as the default list range', () => {
    vi.setSystemTime(new Date('2026-06-14T10:30:00+08:00'));

    expect(todayDateString()).toBe('2026-06-14');
    expect(buildTodayDateRange()).toEqual({
      start: dayjs('2026-06-14'),
      end: dayjs('2026-06-14'),
    });
    expect(buildTodayDateParams()).toEqual({
      from: '2026-06-14',
      to: '2026-06-14',
    });

    vi.useRealTimers();
  });
});
