import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';

import { buildLastRange, calendarStartOf, isPresetMatch } from './date-range';

describe('buildLastRange', () => {
  it('returns a range spanning exactly N units ending at now', () => {
    const now = dayjs('2026-06-06T10:30:00.000Z');
    const range = buildLastRange('day', 7, now);

    expect(range.end.isSame(now)).toBe(true);
    expect(range.start.isSame(now.subtract(7, 'day'))).toBe(true);
  });

  it('supports week / month / year units', () => {
    const now = dayjs('2026-06-06T10:30:00.000Z');
    expect(buildLastRange('week', 2, now).start.isSame(now.subtract(2, 'week'))).toBe(true);
    expect(buildLastRange('month', 3, now).start.isSame(now.subtract(3, 'month'))).toBe(true);
    expect(buildLastRange('year', 1, now).start.isSame(now.subtract(1, 'year'))).toBe(true);
  });

  it('throws on non-positive n', () => {
    expect(() => buildLastRange('day', 0)).toThrow();
    expect(() => buildLastRange('day', -3)).toThrow();
  });
});

describe('isPresetMatch', () => {
  const now = dayjs('2026-06-06T10:30:00.000Z');

  it('matches a fresh preset range', () => {
    const range = buildLastRange('day', 7, now);
    expect(isPresetMatch(range, 'day', 7, undefined, now)).toBe(true);
  });

  it('returns false for null value', () => {
    expect(isPresetMatch(null, 'day', 7, undefined, now)).toBe(false);
  });

  it('returns false when start day differs by even 1', () => {
    const range = buildLastRange('day', 7, now);
    const shifted = { start: range.start.subtract(1, 'day'), end: range.end };
    expect(isPresetMatch(shifted, 'day', 7, undefined, now)).toBe(false);
  });

  it('ignores intra-day time differences (startOf day alignment)', () => {
    const range = buildLastRange('day', 7, now);
    const tweakedTime = { start: range.start.add(3, 'hour'), end: range.end.add(3, 'hour') };
    expect(isPresetMatch(tweakedTime, 'day', 7, undefined, now)).toBe(true);
  });
});

describe('calendarStartOf', () => {
  // T1.1 修复：业务口径为"自然周 = 周一到周日"。
  // 2026-06-09 是周二，calendarStartOf('week') 必须返回 2026-06-08（周一），
  // 不能是 dayjs 默认 startOf('week') 给的周日。
  it('returns Monday for any day in the week (not Sunday)', () => {
    const tue = dayjs('2026-06-09T15:00:00');
    const mon = dayjs('2026-06-08T00:00:00');
    expect(calendarStartOf('week', tue).isSame(mon, 'day')).toBe(true);

    const sun = dayjs('2026-06-14T10:00:00');
    const expectedMon = dayjs('2026-06-08T00:00:00');
    expect(calendarStartOf('week', sun).isSame(expectedMon, 'day')).toBe(true);

    const sat = dayjs('2026-06-13T23:59:00');
    expect(calendarStartOf('week', sat).isSame(expectedMon, 'day')).toBe(true);
  });

  it('returns first day of month for month', () => {
    const mid = dayjs('2026-06-09T12:00:00');
    expect(calendarStartOf('month', mid).isSame(dayjs('2026-06-01T00:00:00'), 'day')).toBe(true);
  });

  it('returns start of day for day', () => {
    const mid = dayjs('2026-06-09T12:34:56');
    expect(calendarStartOf('day', mid).isSame(dayjs('2026-06-09T00:00:00'), 'minute')).toBe(true);
  });
});
