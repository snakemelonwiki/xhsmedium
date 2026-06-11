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

/**
 * 相对时间格式化，用于提醒场景：
 * - 已过期 → "已过期3天" / "已过期2小时"
 * - 今天 → "今天 14:30"
 * - 明天 → "明天 14:30"
 * - 其他 → "06月09日 14:30"
 *
 * 返回 { label, color } 供 Ant Design Tag 直接使用：
 *   color = 'red' | 'orange' | 'blue' | 'default'
 */
export function formatRemindTimeTag(
  value?: string | number | Date | null,
): { label: string; color: string } {
  if (!value) return { label: '-', color: 'default' };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { label: '-', color: 'default' };

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  const time = `${PAD(date.getHours())}:${PAD(date.getMinutes())}`;

  // 已过期
  if (diffMs > 0) {
    if (diffDay > 0) return { label: `已过期${diffDay}天`, color: 'red' };
    if (diffHour > 0) return { label: `已过期${diffHour}小时`, color: 'red' };
    if (diffMin > 0) return { label: `已过期${diffMin}分钟`, color: 'red' };
    return { label: '刚刚到期', color: 'red' };
  }

  // 未到期
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return { label: `今天 ${time}`, color: 'orange' };

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return { label: `明天 ${time}`, color: 'orange' };

  return {
    label: `${PAD(date.getMonth() + 1)}月${PAD(date.getDate())}日 ${time}`,
    color: 'blue',
  };
}
