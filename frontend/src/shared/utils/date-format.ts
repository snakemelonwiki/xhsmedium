/**
 * B 端共享日期格式化工具。
 * 规范：日期显示为「YYYY年MM月DD日」，时间（HH:mm:ss）保持原样不被改动。
 * 例：`2026年06月02日 14:30:00`、`2026年06月02日 14:30`。
 */

const PAD = (n: number) => String(n).padStart(2, '0');

/**
 * 把可解析的日期值（ISO 字符串、Date、null/undefined）格式化为
 * "YYYY年MM月DD日 HH:mm:ss" 形式；空值或非法值返回 '-'。
 * 时间部分（HH:mm:ss）从原值取，不做时区转换以外的任何处理。
 */
export function formatDateTime(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}年${PAD(date.getMonth() + 1)}月${PAD(date.getDate())}日 ${PAD(date.getHours())}:${PAD(date.getMinutes())}:${PAD(date.getSeconds())}`;
}

/**
 * 把可解析的日期值格式化为 "YYYY年MM月DD日 HH:mm" 形式（无秒）。
 */
export function formatDateTimeMinute(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}年${PAD(date.getMonth() + 1)}月${PAD(date.getDate())}日 ${PAD(date.getHours())}:${PAD(date.getMinutes())}`;
}

/**
 * 纯日期（无时间）格式化："YYYY年MM月DD日"。
 */
export function formatDate(value?: string | number | Date | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}年${PAD(date.getMonth() + 1)}月${PAD(date.getDate())}日`;
}
