/**
 * 将老师关联的目录 ID 列表（如 "1,3,5"）映射为显示名称。
 * 优先使用后端已解析的 names 字段，否则根据 options 映射。
 */
export function formatTeacherCatalogNames(
  value: string | null | undefined,
  options: { label: string; value: string }[],
  names?: string | null,
): string {
  if (names) return names;
  if (!value) return '-';
  const opts = options ?? [];
  return value
    .split(',')
    .filter(Boolean)
    .map((id) => opts.find((o) => o.value === id.trim())?.label ?? id.trim())
    .join('、');
}
