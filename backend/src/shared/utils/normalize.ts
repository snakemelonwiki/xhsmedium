export const POST_TYPES = {
  HUO_KE: '获客帖',
  REN_SHE: '人设帖',
  TAO_LUN: '讨论帖',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

export const normalizePostType = (type: unknown): PostType => {
  const value = String(type || '').trim();
  if (value === '获客贴' || value === '获客帖') return POST_TYPES.HUO_KE;
  if (value === '素人贴' || value === '人设贴' || value === '人设帖') return POST_TYPES.REN_SHE;
  if (value === '话题贴' || value === '讨论帖' || value === '讨论贴') return POST_TYPES.TAO_LUN;
  if (value === '营销贴' || value === '营销帖') return POST_TYPES.HUO_KE;
  return (value as PostType) || POST_TYPES.HUO_KE;
};

export const normalizeExternalUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
};

export const normalizeMediaUrl = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.hostname === 'uploads' || isLocalUploadUrl(url)) {
        return url.pathname.startsWith('/uploads/')
          ? url.pathname
          : `/uploads${url.pathname}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  const normalized = raw.replace(/^\/+/, '');
  if (normalized.startsWith('uploads/')) return `/${normalized}`;
  return raw;
};

const isLocalUploadUrl = (url: URL): boolean => {
  return url.pathname.startsWith('/uploads/')
    && ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(url.hostname.toLowerCase());
};

export const normalizeTrafficByType = (postType: unknown, traffic: unknown): number => {
  return Number(traffic || 0);
};
