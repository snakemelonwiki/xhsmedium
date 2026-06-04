import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PagedResult, PageQuery } from '@/shared/types/pagination';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * v1.3 / OP-11 我的收藏：单条记录
 * - targetType: 'post' | 'account'
 * - target: 关联对象快照；关联被删时为 null
 */
export type FavoriteTargetType = 'post' | 'account';

export type FavoritePostSnapshot = {
  id: string;
  title?: string;
  platform?: string;
  postType?: string;
  coverImageUrl?: string;
  coverThumbUrl?: string;
  postUrl?: string;
  accountId?: string;
  likes?: number;
  comments?: number;
  favorites?: number;
  publishedAt?: string;
};

export type FavoriteAccountSnapshot = {
  id: string;
  accountName?: string;
  platform?: string;
  profileUrl?: string;
  accountUid?: string;
  employeeId?: string;
};

export type FavoriteItem = {
  id: string;
  userId?: string;
  targetType: FavoriteTargetType;
  targetId: string;
  target: FavoritePostSnapshot | FavoriteAccountSnapshot | null;
  createdAt?: string;
};

function mapFavoriteItem(raw: RawRecord): FavoriteItem {
  const targetType = (text(raw.targetType) === 'account' ? 'account' : 'post') as FavoriteTargetType;
  const targetRaw = (raw.target && typeof raw.target === 'object' ? (raw.target as RawRecord) : null) || null;
  return {
    id: text(raw.id) ?? '',
    userId: text(raw.userId),
    targetType,
    targetId: text(raw.targetId) ?? '',
    target: targetRaw
      ? targetType === 'post'
        ? {
            id: text(targetRaw.id) ?? '',
            title: text(targetRaw.title),
            platform: text(targetRaw.platform),
            postType: text(targetRaw.postType),
            coverImageUrl: text(targetRaw.coverImageUrl),
            coverThumbUrl: text(targetRaw.coverThumbUrl),
            postUrl: text(targetRaw.postUrl),
            accountId: text(targetRaw.accountId),
            likes: numberValue(targetRaw.likes),
            comments: numberValue(targetRaw.comments),
            favorites: numberValue(targetRaw.favorites),
            publishedAt: text(targetRaw.publishedAt),
          }
        : {
            id: text(targetRaw.id) ?? '',
            accountName: text(targetRaw.accountName),
            platform: text(targetRaw.platform),
            profileUrl: text(targetRaw.profileUrl),
            accountUid: text(targetRaw.accountUid),
            employeeId: text(targetRaw.employeeId),
          }
      : null,
    createdAt: text(raw.createdAt),
  };
}

/**
 * 拉取我的收藏（运营/销售/教务），按收藏时间倒序。
 * Query: targetType=post|account（可选）, limit, offset
 */
export async function listMyFavorites(query: {
  targetType?: FavoriteTargetType;
  limit?: number;
  offset?: number;
} = {}): Promise<PagedResult<FavoriteItem>> {
  const limit = Number(query.limit ?? 20);
  const offset = Number(query.offset ?? 0);
  const payload = await apiClient.get<unknown>('/favorites/mine', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    items: paged.items.map(mapFavoriteItem),
  };
}

/**
 * 取消收藏（post 或 account）。等价于 toggle 一次（已收藏时再点会取消）。
 */
export async function removeFavorite(
  targetType: FavoriteTargetType,
  targetId: string,
): Promise<{ ok: boolean; favorited: boolean }> {
  return apiClient.post<{ ok: boolean; favorited: boolean }>('/favorites/toggle', {
    targetType,
    targetId,
  });
}
