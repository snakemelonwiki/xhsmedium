import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';

import { buildLastRange, isPresetMatch } from './date-range';

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
    expect(isPresetMatch(range, 'day', 7, now)).toBe(true);
  });

  it('returns false for null value', () => {
    expect(isPresetMatch(null, 'day', 7, now)).toBe(false);
  });

  it('returns false when start day differs by even 1', () => {
    const range = buildLastRange('day', 7, now);
    const shifted = { start: range.start.subtract(1, 'day'), end: range.end };
    expect(isPresetMatch(shifted, 'day', 7, now)).toBe(false);
  });

  it('ignores intra-day time differences (startOf day alignment)', () => {
    const range = buildLastRange('day', 7, now);
    const tweakedTime = { start: range.start.add(3, 'hour'), end: range.end.add(3, 'hour') };
    expect(isPresetMatch(tweakedTime, 'day', 7, now)).toBe(true);
  });
});
