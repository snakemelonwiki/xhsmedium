import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';
import type {
  AccountTimeseries,
  ContentPost,
  DashboardSummary,
  ImportTask,
  PlatformDistributionItem,
  PlatformTrend,
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

// ============ v1.3 OP-18/19/23 双平台 + 账号分析 ============

function textOrEmpty(value: unknown): string {
  return text(value) ?? '';
}

/**
 * v1.3 OP-18: 双平台分布（小红书 / 抖音）作品 / 流量 / 获客占比
 * - employeeId: 主管查看指定员工时传入，运营端查看自己时不传
 */
export async function getPersonalPlatformDistribution(
  query: { from?: string; to?: string; platform?: string; employeeId?: string } = {},
): Promise<PlatformDistributionItem[]> {
  const payload = await apiClient.get<unknown>('/dashboard/personal/platform-distribution', {
    query,
  });
  return rawItems(payload).map((raw) => ({
    platform: text(raw.platform) ?? '',
    postCount: numberValue(raw.postCount ?? raw.post_count),
    leadCount: numberValue(raw.leadCount ?? raw.lead_count),
    traffic: numberValue(raw.traffic),
  }));
}

/**
 * v1.3 OP-19: 双平台作品量（每日/每周/每月）+ 流量 + 获客
 * - employeeId: 主管查看指定员工时传入，运营端查看自己时不传
 */
export async function getPersonalPlatformTrend(
  query: { period?: 'day' | 'week' | 'month'; from?: string; to?: string; employeeId?: string } = {},
): Promise<PlatformTrend> {
  const raw = (await apiClient.get<unknown>('/dashboard/personal/platform-trend', {
    query,
  })) as RawRecord;
  const points = Array.isArray(raw.points)
    ? (raw.points as RawRecord[]).map((p) => ({
        date: text(p.date) ?? '',
        xiaohongshuCount: numberValue(p.xiaohongshuCount),
        douyinCount: numberValue(p.douyinCount),
        xiaohongshuTraffic: numberValue(p.xiaohongshuTraffic),
        douyinTraffic: numberValue(p.douyinTraffic),
        xiaohongshuLeads: numberValue(p.xiaohongshuLeads),
        douyinLeads: numberValue(p.douyinLeads),
      }))
    : [];
  const period = (text(raw.period) ?? 'day') as 'day' | 'week' | 'month';
  return {
    period,
    from: text(raw.from) ?? '',
    to: text(raw.to) ?? '',
    points,
  };
}

/**
 * v1.3 OP-23: 账号时间序列（按日聚合）
 * - days=30 默认；与 from/to 互斥
 * - 返回 { account, from, to, days, summary }
 */
export async function getAccountTimeseries(
  accountId: string,
  query: { days?: number; from?: string; to?: string } = {},
): Promise<AccountTimeseries> {
  const raw = (await apiClient.get<unknown>(
    `/dashboard/personal/account/${encodeURIComponent(accountId)}/timeseries`,
    { query },
  )) as RawRecord;
  return parseAccountTimeseries(raw);
}

/**
 * v1.3 OP-23 扩展：当前员工名下全部账号的时间序列（各账号独立）。
 * 不再聚合为单条数据，而是返回每个账号各自的 timeseries 数组。
 * 前端分别渲染各账号的日历视图。
 */
export async function getAllAccountsTimeseries(
  query: { days?: number; from?: string; to?: string; platform?: string; sort?: string } = {},
): Promise<{ accounts: AccountInfo[]; items: AccountTimeseries[] }> {
  const raw = (await apiClient.get<unknown>(
    `/dashboard/personal/accounts/timeseries`,
    { query },
  )) as RawRecord;
  const accounts = Array.isArray(raw.accounts) ? (raw.accounts as RawRecord[]).map(mapAccountInfo) : [];
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]).map(parseAccountTimeseries) : [];
  return { accounts, items };
}

function mapAccountInfo(raw: RawRecord): AccountInfo {
  return {
    id: textOrEmpty(raw.id),
    accountName: textOrEmpty(raw.accountName),
    platform: textOrEmpty(raw.platform),
    postingPlan: text(raw.postingPlan) ?? '',
    persona: text(raw.persona) ?? '',
    positioning: text(raw.positioning) ?? '',
  };
}

export interface AccountInfo {
  id: string;
  accountName: string;
  platform: string;
  postingPlan: string;
  persona: string;
  positioning: string;
}

function parseAccountTimeseries(raw: RawRecord): AccountTimeseries {
  const account = (raw.account ?? {}) as RawRecord;
  const summary = (raw.summary ?? {}) as RawRecord;
  const days = Array.isArray(raw.days)
    ? (raw.days as RawRecord[]).map((d) => ({
        date: text(d.date) ?? '',
        postCount: numberValue(d.postCount),
        leadCount: numberValue(d.leadCount),
        traffic: numberValue(d.traffic),
        posts: Array.isArray(d.posts)
          ? (d.posts as RawRecord[]).map((p) => ({
              postId: textOrEmpty(p.postId),
              title: textOrEmpty(p.title),
              platform: textOrEmpty(p.platform),
              type: textOrEmpty(p.type),
              isLead: p.isLead === true || p.isLead === 1 || p.isLead === '1',
              leadCount: numberValue(p.leadCount),
              traffic: numberValue(p.traffic),
            }))
          : [],
      }))
    : [];
  return {
    account: {
      id: textOrEmpty(account.id),
      accountName: textOrEmpty(account.accountName),
      platform: textOrEmpty(account.platform),
      postingPlan: text(account.postingPlan) ?? '',
      persona: text(account.persona) ?? '',
      positioning: text(account.positioning) ?? '',
    },
    from: text(raw.from) ?? '',
    to: text(raw.to) ?? '',
    days,
    summary: {
      postCount: numberValue(summary.postCount),
      leadCount: numberValue(summary.leadCount),
      traffic: numberValue(summary.traffic),
      highLeadDays: numberValue(summary.highLeadDays),
      lowLeadDays: numberValue(summary.lowLeadDays),
      noPostDays: numberValue(summary.noPostDays),
    },
  };
}

// ============================================================
// v1.3 个人看板（OP-1/2/3/4/16/17/24）
// 流量口径：likes + comments + favorites（不含分享）
// ============================================================

export type PersonalMetric = 'totalLeads' | 'totalTraffic' | 'efficiency' | 'leadEfficiency';
export type PersonalPlatform = 'xiaohongshu' | 'douyin' | 'all';
export type PersonalPeriod = 'today' | 'week' | 'month' | 'all';

export interface PersonalOverview {
  totalTraffic: number;
  totalLeads: number;
  monthPostCount: number;
  monthLeadCount: number;
  monthTraffic: number;
  monthLeadPostCount: number;
}

export interface PersonalOverviewResponse {
  period: { from: string; to: string; code: string; monthStart: string };
  employeeId: string;
  metrics: string;
  platform: string | null;
  overview: PersonalOverview;
  ranking: {
    rank: number | null;
    total: number;
    gapToPrev: number;
    metricValue: number;
  };
}

export interface EfficiencyAccount {
  accountId: string;
  accountName: string;
  platform: string;
  postCount: number;
  leadPostCount: number;
  leadCount: number;
  traffic: number;
  efficiency: number;
  leadEfficiency: number;
  trend: number[];
}

export interface PersonalRankingsResponse {
  period: { from: string; to: string };
  employeeId: string;
  platform: string | null;
  accounts: {
    traffic: EfficiencyAccount[];
    efficiency: EfficiencyAccount[];
    leadEfficiency: EfficiencyAccount[];
  };
}

export interface PersonalTodayResponse {
  date: string;
  platform: string | null;
  todayPostCount: number;
  todayLeadCount: number;
  todayTraffic: number;
}

export interface PersonalOverviewQuery {
  metrics?: PersonalMetric;
  platform?: PersonalPlatform;
  period?: PersonalPeriod;
  from?: string;
  to?: string;
  /** 主管查看指定员工时使用 */
  employeeId?: string;
}

function buildPersonalPath(employeeId?: string): string {
  if (employeeId) {
    return `/dashboard/supervisor/employee/${encodeURIComponent(employeeId)}/overview`;
  }
  return '/dashboard/personal/overview';
}

function buildRankingsPath(employeeId?: string): string {
  if (employeeId) {
    return `/dashboard/supervisor/employee/${encodeURIComponent(employeeId)}/rankings`;
  }
  return '/dashboard/personal/rankings';
}

function buildTodayPath(employeeId?: string): string {
  if (employeeId) {
    return `/dashboard/supervisor/employee/${encodeURIComponent(employeeId)}/today`;
  }
  return '/dashboard/personal/today';
}

/**
 * v1.3 OP-1/2/3/16 个人看板 5 张概览卡 + 名次。
 * 运营端不传 employeeId；主管端传 employeeId 即查看指定员工数据。
 */
export async function getPersonalOverview(
  query: PersonalOverviewQuery = {},
): Promise<PersonalOverviewResponse> {
  return apiClient.get<PersonalOverviewResponse>(buildPersonalPath(query.employeeId), {
    query: {
      metrics: query.metrics,
      platform: query.platform,
      period: query.period,
      from: query.from,
      to: query.to,
    },
  });
}

/**
 * v1.3 OP-17/24 三大效率榜（流量榜 / 获客效率榜 / 获客贴效率榜）。
 */
export type PersonalRankingSort = 'leadCount' | 'postCount' | 'traffic' | 'efficiency' | 'leadEfficiency';

export async function getPersonalRankings(
  query: { platform?: PersonalPlatform; period?: PersonalPeriod; from?: string; to?: string; employeeId?: string; sort?: PersonalRankingSort } = {},
): Promise<PersonalRankingsResponse> {
  return apiClient.get<PersonalRankingsResponse>(buildRankingsPath(query.employeeId), {
    query: {
      platform: query.platform,
      period: query.period,
      from: query.from,
      to: query.to,
      sort: query.sort,
    },
  });
}

/**
 * v1.3 OP-4 运营总览今日数据：今日作品 / 今日客资 / 今日流量（去除今日成交）。
 */
export async function getPersonalToday(
  query: { platform?: PersonalPlatform; date?: string; employeeId?: string } = {},
): Promise<PersonalTodayResponse> {
  return apiClient.get<PersonalTodayResponse>(buildTodayPath(query.employeeId), {
    query: { platform: query.platform, date: query.date },
  });
}
