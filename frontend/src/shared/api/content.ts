import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';
import type {
  ContentPost,
  DashboardSummary,
  ImportTask,
  PostTypeDistribution,
  RankingRow,
} from '@/shared/types/content';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function idText(value: unknown): string {
  return text(value) ?? '';
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function imageUrl(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
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
}

function isLocalUploadUrl(url: URL): boolean {
  return url.pathname.startsWith('/uploads/')
    && ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(url.hostname.toLowerCase());
}

export interface FavoriteToggleResult {
  isFavorited: boolean;
  favorites?: number;
}

function rawItems(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload as RawRecord[];
  const data = (payload ?? {}) as { rows?: unknown; items?: unknown; data?: unknown };
  if (Array.isArray(data.rows)) return data.rows as RawRecord[];
  if (Array.isArray(data.items)) return data.items as RawRecord[];
  if (Array.isArray(data.data)) return data.data as RawRecord[];
  return [];
}

function withPaging(query: PageQuery): { page: number; pageSize: number; limit: number; offset: number } {
  const pageSize = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = Number(query.offset ?? (page - 1) * pageSize);
  return { page, pageSize, limit: pageSize, offset };
}

function mapPost(raw: RawRecord): ContentPost {
  const leadsCount = numberValue(raw.leadsCount ?? raw.leadCount ?? raw.leads_count);
  return {
    id: idText(raw.id),
    platform: text(raw.platform) ?? '未知平台',
    title: text(raw.title) ?? '未命名作品',
    copywriting: text(raw.copywriting),
    accountId: text(raw.accountId ?? raw.account_id),
    accountName: text(raw.accountName ?? raw.account_name),
    employeeId: text(raw.employeeId ?? raw.employee_id),
    employeeName: text(raw.employeeName ?? raw.employee_name),
    postType: text(raw.postType ?? raw.post_type),
    postUrl: text(raw.postUrl ?? raw.post_url),
    coverImageUrl: imageUrl(raw.coverImageUrl ?? raw.cover_image_url),
    coverThumbUrl: imageUrl(raw.coverThumbUrl ?? raw.cover_thumb_url),
    publishedAt: text(raw.publishedAt ?? raw.published_at),
    metricsUpdatedAt: text(raw.metricsUpdatedAt ?? raw.metrics_updated_at),
    note: text(raw.note),
    supervisorSuggestion: text(raw.supervisorSuggestion ?? raw.supervisor_suggestion),
    isFavorited: boolValue(raw.isFavorited ?? raw.is_favorited),
    metrics: {
      traffic: numberValue(raw.traffic),
      likes: numberValue(raw.likes),
      comments: numberValue(raw.comments),
      favorites: numberValue(raw.favorites),
      shares: numberValue(raw.shares),
      leadsCount,
    },
  };
}

function mapRanking(raw: RawRecord, index: number): RankingRow {
  return {
    id: idText(raw.id ?? raw.employeeId ?? raw.employee_id) || `ranking-${index}`,
    employeeId: text(raw.employeeId ?? raw.employee_id),
    name: text(raw.name ?? raw.employeeName ?? raw.employee_name) ?? '未命名员工',
    postCount: numberValue(raw.postCount ?? raw.post_count),
    leadCount: numberValue(raw.leadCount ?? raw.lead_count),
    todayPosts: numberValue(raw.todayPosts ?? raw.today_posts),
    todayLeads: numberValue(raw.todayLeads ?? raw.today_leads),
    todayTraffic: numberValue(raw.todayTraffic ?? raw.today_traffic),
    todayDeals: numberValue(raw.todayDeals ?? raw.today_deals),
    xhsPostCount: numberValue(raw.xhsPostCount ?? raw.xhs_post_count),
    douyinPostCount: numberValue(raw.douyinPostCount ?? raw.douyin_post_count),
  };
}

function mapImportTask(raw: RawRecord): ImportTask {
  return {
    id: idText(raw.id),
    importType: text(raw.importType ?? raw.import_type) ?? 'unknown',
    status: text(raw.status) ?? 'unknown',
    totalCount: numberValue(raw.totalCount ?? raw.total_count),
    successCount: numberValue(raw.successCount ?? raw.success_count),
    failCount: numberValue(raw.failCount ?? raw.fail_count),
    errorFileUrl: text(raw.errorFileUrl ?? raw.error_file_url),
    createdAt: text(raw.createdAt ?? raw.created_at ?? raw.createTime ?? raw.create_time),
    finishedAt: text(raw.finishedAt ?? raw.finished_at),
  };
}

function mapDashboardSummary(payload: unknown): DashboardSummary {
  const raw = (payload ?? {}) as RawRecord;
  return {
    updatedEmployees: numberValue(raw.updatedEmployees),
    updatedAccounts: numberValue(raw.updatedAccounts),
    xhsPosts: numberValue(raw.xhsPosts),
    douyinPosts: numberValue(raw.douyinPosts),
    todayLeads: numberValue(raw.todayLeads),
    todayDeals: numberValue(raw.todayDeals),
    xhsLikes: numberValue(raw.xhsLikes),
    xhsComments: numberValue(raw.xhsComments),
    xhsFavorites: numberValue(raw.xhsFavorites),
    xhsTraffic: numberValue(raw.xhsTraffic),
    douyinLikes: numberValue(raw.douyinLikes),
    douyinComments: numberValue(raw.douyinComments),
    douyinFavorites: numberValue(raw.douyinFavorites),
    douyinTraffic: numberValue(raw.douyinTraffic),
  };
}

export async function listPosts(query: PageQuery = {}): Promise<PagedResult<ContentPost>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  const payload = await apiClient.get<unknown>('/posts', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return { ...paged, page, pageSize, items: paged.items.map(mapPost) };
}

export async function listGalleryPosts(query: PageQuery = {}): Promise<PagedResult<ContentPost>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  try {
    const payload = await apiClient.get<unknown>('/posts', {
      query: { scope: 'all', ...query, limit, offset },
    });
    const paged = normalizePagedResult<RawRecord>(payload);
    return { ...paged, page, pageSize, items: paged.items.map(mapPost) };
  } catch {
    // Fallback to /posts/plaza endpoint which now supports server-side pagination
    const payload = await apiClient.get<unknown>('/posts/plaza', {
      query: { view: 'all', page, pageSize },
    });
    const data = payload as { items?: unknown[]; rows?: unknown[]; total?: number };
    const items = rawItems(data).map(mapPost);
    const total = Number(data?.total ?? items.length);
    return { items, total, page, pageSize };
  }
}

export async function refreshPostMetrics(id: string, postUrl?: string) {
  return apiClient.post(`/posts/${id}/fetch-metrics`, { postUrl });
}

export async function getPostDetail(id: string): Promise<ContentPost> {
  return mapPost(await apiClient.get<RawRecord>(`/posts/${id}`));
}

export async function updatePost(id: string, body: Record<string, unknown>) {
  return apiClient.request(`/posts/${id}`, {
    method: 'PUT',
    body,
  });
}

export async function togglePostFavorite(postId: string): Promise<FavoriteToggleResult> {
  const payload = await apiClient.post<RawRecord>('/favorites/toggle', {
    targetType: 'post',
    targetId: postId,
  });
  return {
    isFavorited: boolValue(payload.favorited ?? payload.isFavorited ?? payload.is_favorited),
    favorites:
      payload.favorites !== undefined || payload.favoritesCount !== undefined
        ? numberValue(payload.favorites ?? payload.favoritesCount)
        : undefined,
  };
}

export async function listRankings(type: string = 'posts', query: PageQuery = {}): Promise<PagedResult<RankingRow>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  const filters = { ...query };
  delete filters.page;
  delete filters.pageSize;
  delete filters.limit;
  delete filters.offset;
  const payload = await apiClient.get<unknown>('/rankings', {
    query: { ...filters, type, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize,
    items: paged.items.map(mapRanking),
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return mapDashboardSummary(await apiClient.get<unknown>('/dashboard/summary'));
}

export async function listPostTypeDistribution(): Promise<PostTypeDistribution[]> {
  const payload = await apiClient.get<unknown>('/dashboard/post-type-distribution');
  return rawItems(payload).map((raw) => ({
    type: text(raw.type ?? raw.postType ?? raw.post_type) ?? '未分类',
    count: numberValue(raw.count),
    ratio: text(raw.ratio),
  }));
}

export async function listImportTasks(query: PageQuery = {}): Promise<PagedResult<ImportTask>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  const payload = await apiClient.get<unknown>('/import-tasks', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return { ...paged, page, pageSize, items: paged.items.map(mapImportTask) };
}
