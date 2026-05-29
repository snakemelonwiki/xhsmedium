export const POST_TYPES = {
  SU_REN: '素人贴',
  HUA_TI: '话题贴',
  HUO_KE: '获客贴',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

export const normalizePostType = (type: unknown): PostType => {
  const value = String(type || '').trim();
  if (value === '人设贴') return POST_TYPES.SU_REN;
  if (value === '讨论帖') return POST_TYPES.HUA_TI;
  if (value === '营销贴') return POST_TYPES.HUO_KE;
  return (value as PostType) || POST_TYPES.SU_REN;
};

export const normalizeExternalUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
};

export const normalizeTrafficByType = (postType: unknown, traffic: unknown): number => {
  return normalizePostType(postType) === POST_TYPES.HUO_KE ? Number(traffic || 0) : 0;
};
