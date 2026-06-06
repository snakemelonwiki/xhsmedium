/**
 * 归一化作品指标展示值。
 */
export function normalizePostMetric(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}
