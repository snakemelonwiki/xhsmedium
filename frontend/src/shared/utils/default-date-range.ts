import dayjs from 'dayjs';

import type { DateRangeValue } from './date-range';

export function todayDateString(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function buildTodayDateRange(): NonNullable<DateRangeValue> {
  const today = todayDateString();
  return { start: dayjs(today), end: dayjs(today) };
}

export function buildTodayDateParams(): { from: string; to: string } {
  const today = todayDateString();
  return { from: today, to: today };
}
