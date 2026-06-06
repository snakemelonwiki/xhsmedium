import dayjs, { type Dayjs } from 'dayjs';

/**
 * 受控日期范围值。与 antd RangePicker 保持一致：start <= end。
 * 父组件传 null 表示未选。
 */
export type DateRangeValue = { start: Dayjs; end: Dayjs } | null;

/**
 * dayjs 的可减时间单位（覆盖"近 X 天/周/月/年"四种快捷预设）。
 */
export type DateRangeUnit = 'day' | 'week' | 'month' | 'year';

/**
 * 预设项：label 决定按钮文案，unit + n 决定 [now - n*unit, now] 的范围。
 */
export type DateRangePreset = {
  key: string;
  label: string;
  unit: DateRangeUnit;
  n: number;
};

/**
 * 默认 6 个快捷预设：近 1 天 / 7 天 / 30 天 / 90 天 / 近 1 年 / 近 3 年。
 * 覆盖业务最常见的"日 / 周 / 月 / 年"四档粒度。
 */
export const DEFAULT_RANGE_PRESETS: ReadonlyArray<DateRangePreset> = [
  { key: '1d', label: '近 1 天', unit: 'day', n: 1 },
  { key: '7d', label: '近 7 天', unit: 'day', n: 7 },
  { key: '30d', label: '近 30 天', unit: 'day', n: 30 },
  { key: '90d', label: '近 90 天', unit: 'day', n: 90 },
  { key: '1y', label: '近 1 年', unit: 'year', n: 1 },
  { key: '3y', label: '近 3 年', unit: 'year', n: 3 },
];

/**
 * 完整 12 个快捷预设：覆盖更细粒度。
 * 顺序：日（今日 + 近 3/6 天）→ 周（本周 + 近 3/6 周）→ 月（本月 + 近 3/6 月）→ 年（本年 + 近 3 年）。
 * 适用于"下拉选择"模式（variant='select'），按钮模式（variant='buttons'）下 12 个太挤，建议用 DEFAULT_RANGE_PRESETS。
 */
export const RANGE_PRESETS_FULL: ReadonlyArray<DateRangePreset> = [
  { key: 'today', label: '今日', unit: 'day', n: 1 },
  { key: '3d', label: '近 3 天', unit: 'day', n: 3 },
  { key: '6d', label: '近 6 天', unit: 'day', n: 6 },
  { key: 'thisWeek', label: '本周', unit: 'week', n: 1 },
  { key: '3w', label: '近 3 周', unit: 'week', n: 3 },
  { key: '6w', label: '近 6 周', unit: 'week', n: 6 },
  { key: 'thisMonth', label: '本月', unit: 'month', n: 1 },
  { key: '3m', label: '近 3 个月', unit: 'month', n: 3 },
  { key: '6m', label: '近 6 个月', unit: 'month', n: 6 },
  { key: 'thisYear', label: '本年', unit: 'year', n: 1 },
  { key: '3y', label: '近 3 年', unit: 'year', n: 3 },
];

/**
 * 计算"近 n 个 unit"的范围：[now - n*unit, now]。
 * end 取调用瞬间的 dayjs.now；start 用 subtract 得到。
 * 全部归到毫秒精度（subtract 默认就是），便于下游做"是否匹配预设"判断。
 */
export function buildLastRange(unit: DateRangeUnit, n: number, now: Dayjs = dayjs()): { start: Dayjs; end: Dayjs } {
  if (n <= 0) {
    throw new Error(`buildLastRange: n must be > 0, got ${n}`);
  }
  return { start: now.subtract(n, unit), end: now };
}

/**
 * 判断给定的 value 是否"匹配"某个预设生成的范围。
 * 规则：start/end 都用 startOf('day') 对齐到天，相等即视为匹配。
 * 这样用户点过预设后再点开 RangePicker 改时间，预设高亮会自然清空（因为 day 对不上了）。
 */
export function isPresetMatch(value: DateRangeValue, unit: DateRangeUnit, n: number, now: Dayjs = dayjs()): boolean {
  if (!value) return false;
  const target = buildLastRange(unit, n, now);
  return value.start.startOf('day').isSame(target.start.startOf('day'))
      && value.end.startOf('day').isSame(target.end.startOf('day'));
}
