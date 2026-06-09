import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PagedResult, PageQuery } from '@/shared/types/pagination';
import type {
  AdminAccount,
  AdminDashboardSummary,
  AdminEmployee,
  AdminLead,
  AdminPostTypeDistribution,
  AdminRankingRow,
} from '@/shared/types/admin';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function numberValue(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function mapLead(raw: RawRecord): AdminLead {
  return {
    id: text(raw.id) ?? '',
    customerName: text(raw.customerName) ?? text(raw.nickname) ?? text(raw.contactInfo) ?? '未命名客户',
    contact: text(raw.contact) ?? text(raw.contactInfo) ?? text(raw.phone) ?? text(raw.wechat),
    platform: text(raw.platform),
    operatorName: text(raw.employeeName) ?? text(raw.operatorName) ?? text(raw.sourceOperatorName),
    salesName: text(raw.assignedSalesUserName) ?? text(raw.salesUserName),
    status: text(raw.status) ?? 'new',
    addStatus: text(raw.addStatus),
    processStatus: text(raw.processStatus),
    collaborationStatus: text(raw.collaborationStatus),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
    latestFollowNote: text(raw.latestFollowNote) ?? text(raw.salesFeedback) ?? text(raw.note),
    latestFollowAt: text(raw.latestFollowAt) ?? text(raw.followedAt),
    sourcePostTitle: text(raw.sourcePostTitle) ?? text(raw.postTitle),
    sourceAccountName: text(raw.sourceAccountName) ?? text(raw.accountName),
    accountId: text(raw.accountId) ?? text(raw.sourceAccountId),
    postId: text(raw.postId) ?? text(raw.sourcePostId),
    employeeId: text(raw.employeeId),
    assignedSalesUserId: text(raw.assignedSalesUserId),
  };
}

function mapEmployee(raw: RawRecord): AdminEmployee {
  return {
    id: text(raw.id) ?? '',
    employeeCode: text(raw.employeeCode),
    name: text(raw.name) ?? '未命名员工',
    phone: text(raw.phone) ?? null,
    hireDate: text(raw.hireDate) ?? null,
    status: text(raw.status),
    department: text(raw.department) ?? null,
    createdAt: text(raw.createdAt),
    roleType: text(raw.roleType),
    role: text(raw.role),
  };
}

function mapAccount(raw: RawRecord): AdminAccount {
  return {
    id: text(raw.id) ?? '',
    employeeId: text(raw.employeeId),
    employeeName: text(raw.employeeName) ?? '',
    platform: text(raw.platform),
    profileUrl: text(raw.profileUrl) ?? null,
    accountName: text(raw.accountName) ?? '未命名账号',
    accountUid: text(raw.accountUid) ?? null,
    persona: text(raw.persona) ?? null,
    positioning: text(raw.positioning) ?? null,
    postingPlan: text(raw.postingPlan) ?? null,
    status: text(raw.status),
    createdAt: text(raw.createdAt),
  };
}

function mapRankingRow(raw: RawRecord): AdminRankingRow {
  return {
    employeeId: text(raw.employeeId) ?? text(raw.employee_id) ?? '',
    name: text(raw.name) ?? text(raw.employeeName) ?? '未命名员工',
    accountCount: numberValue(raw.accountCount ?? raw.account_count),
    todayPosts: numberValue(raw.todayPosts ?? raw.today_posts),
    todayLeads: numberValue(raw.todayLeads ?? raw.today_leads),
    todayTraffic: numberValue(raw.todayTraffic ?? raw.today_traffic),
    todayDeals: numberValue(raw.todayDeals ?? raw.today_deals),
    postCount: numberValue(raw.postCount),
    xhsPostCount: numberValue(raw.xhsPostCount),
    douyinPostCount: numberValue(raw.douyinPostCount),
    leadCount: numberValue(raw.leadCount),
  };
}

export interface AdminLeadsStats {
  total: number;
  filteredTotal: number;
  assigned: number;
  pending: number;
  byStatus: Record<string, number>;
  byAddStatus: Record<string, number>;
  byProcess: Record<string, number>;
}

export interface AdminLeadPostAggregate {
  postId: string;
  postTitle: string;
  postUrl: string | null;
  platform: string | null;
  accountId: string | null;
  accountName: string | null;
  leadCount: number;
}

function mapStats(raw: RawRecord): AdminLeadsStats {
  const byStatus: Record<string, number> = {};
  const byAddStatus: Record<string, number> = {};
  const byProcess: Record<string, number> = {};
  const rawByStatus = raw.byStatus as RawRecord[] | undefined;
  const rawByAddStatus = raw.byAddStatus as RawRecord[] | undefined;
  const rawByProcess = raw.byProcess as RawRecord[] | undefined;
  if (Array.isArray(rawByStatus)) {
    rawByStatus.forEach((item) => {
      const k = text(item.k) ?? '';
      byStatus[k] = numberValue(item.n);
    });
  }
  if (Array.isArray(rawByAddStatus)) {
    rawByAddStatus.forEach((item) => {
      const k = text(item.k) ?? '';
      byAddStatus[k] = numberValue(item.n);
    });
  }
  if (Array.isArray(rawByProcess)) {
    rawByProcess.forEach((item) => {
      const k = text(item.k) ?? '';
      byProcess[k] = numberValue(item.n);
    });
  }
  return {
    total: numberValue(raw.total),
    filteredTotal: numberValue(raw.filteredTotal),
    assigned: numberValue(raw.assigned),
    pending: numberValue(raw.pending),
    byStatus,
    byAddStatus,
    byProcess,
  };
}

export async function getAdminLeadsStats(query: PageQuery = {}): Promise<AdminLeadsStats> {
  const payload = await apiClient.get<RawRecord>('/leads/stats', {
    query: { scope: 'all', ...query },
  });
  return mapStats(payload);
}

export async function listAdminLeads(query: PageQuery = {}): Promise<PagedResult<AdminLead>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/leads', {
    query: { scope: 'all', ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapLead),
  };
}

/**
 * v1.3 / T5.3：主管端客资看板"按客资量降序"视图——按作品维度聚合 lead 数。
 */
export async function listAdminLeadsByPost(query: PageQuery = {}, options: { signal?: AbortSignal } = {}): Promise<{ items: AdminLeadPostAggregate[]; total: number }> {
  const payload = await apiClient.get<unknown>('/leads/aggregate-by-post', { query, signal: options.signal });
  const raw = (payload ?? {}) as RawRecord;
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]) : [];
  return {
    items: items.map((r) => ({
      postId: text(r.postId) ?? '',
      postTitle: text(r.postTitle) ?? '未命名作品',
      postUrl: text(r.postUrl) ?? null,
      platform: text(r.platform) ?? null,
      accountId: text(r.accountId) ?? null,
      accountName: text(r.accountName) ?? null,
      leadCount: numberValue(r.leadCount),
    })),
    total: numberValue(raw.total),
  };
}

export async function listAdminEmployees(query: PageQuery = {}): Promise<PagedResult<AdminEmployee>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/employees', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapEmployee),
  };
}

export async function saveAdminEmployee(body: Partial<AdminEmployee> & { name: string }) {
  // 前端表单字段名 roleType → 后端期望 loginRole。
  // 同时把前端别名 'operations' 翻译为后端枚举 'operation'（与 User.role enum 对齐）。
  const { roleType, ...rest } = body;
  const loginRole = roleType ? String(roleType).trim() : undefined;
  const normalizedLoginRole = loginRole === 'operations' ? 'operation' : loginRole;
  const payload = { ...rest, ...(normalizedLoginRole ? { loginRole: normalizedLoginRole } : {}) };
  if (payload.id) {
    return apiClient.request(`/employees/${payload.id}`, { method: 'PUT', body: payload });
  }
  return apiClient.post('/employees', payload);
}

export async function listAdminAccounts(query: PageQuery = {}): Promise<PagedResult<AdminAccount>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/accounts', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapAccount),
  };
}

export async function saveAdminAccount(body: Partial<AdminAccount> & { accountName: string }) {
  if (body.id) {
    return apiClient.request(`/accounts/${body.id}`, { method: 'PUT', body });
  }
  return apiClient.post('/accounts', body);
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary | undefined> {
  const payload = await apiClient.get<RawRecord>('/dashboard/summary').catch(() => undefined);
  if (!payload) return undefined;
  return {
    updatedEmployees: numberValue(payload.updatedEmployees),
    updatedAccounts: numberValue(payload.updatedAccounts),
    xhsPosts: numberValue(payload.xhsPosts),
    douyinPosts: numberValue(payload.douyinPosts),
    todayLeads: numberValue(payload.todayLeads),
    todayDeals: numberValue(payload.todayDeals),
    douyinLikes: numberValue(payload.douyinLikes),
    douyinComments: numberValue(payload.douyinComments),
    douyinFavorites: numberValue(payload.douyinFavorites),
    xhsLikes: numberValue(payload.xhsLikes),
    xhsComments: numberValue(payload.xhsComments),
    xhsFavorites: numberValue(payload.xhsFavorites),
    douyinTraffic: numberValue(payload.douyinTraffic),
    xhsTraffic: numberValue(payload.xhsTraffic),
  };
}

export async function listAdminPostTypeDistribution(): Promise<AdminPostTypeDistribution[]> {
  const payload = await apiClient.get<unknown>('/dashboard/post-type-distribution').catch(() => []);
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => {
    const raw = item as RawRecord;
    return {
      type: text(raw.type) ?? '未分类',
      count: numberValue(raw.count),
      ratio: text(raw.ratio),
    };
  });
}

export async function listAdminRankings(query: PageQuery = {}): Promise<PagedResult<AdminRankingRow>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/rankings', {
    query: { type: 'posts', ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapRankingRow),
  };
}

export type SupervisorOverview = {
  period: { from: string; to: string; code: string };
  postCount: number;
  leadCount: number;
  likes: number;
  interactions: number;
  effectiveAccountCount: number;
  dealCount: number;
  pendingCollaborationCount: number;
  riskReminders: {
    collaborationTimeout: number;
    leadBacklog: number;
    lowUpdateEmployees: number;
    abnormalAccounts: number;
  };
};

export type SupervisorAnalysis = {
  filters: { platform: string | null; employeeId: string; accountId?: string; from?: string; to?: string };
  platformTrend: Array<{ date: string; platform: string; postCount: number; likes: number }>;
  postStructure: Array<{ type: string; count: number }>;
  leadTrend: Array<{ date: string; platform: string; leadCount: number }>;
  // T6.3 流量/效率趋势
  trafficTrend: Array<{ date: string; platform: string; traffic: number }>;
  efficiencyTrend: Array<{ date: string; platform: string; postCount: number; leadCount: number; efficiency: number }>;
  leadEfficiencyTrend: Array<{ date: string; platform: string; leadPostCount: number; leadCount: number; efficiency: number }>;
  // T6.4 按员工聚合比值
  efficiencyRatio: Array<{ employeeId: string; name: string | null; postCount: number; leadCount: number }>;
  leadPostRatio: Array<{ employeeId: string; name: string | null; leadPostCount: number; leadCount: number }>;
};

/**
 * T1.3 主管总览扩展数据。
 * - platformDistribution 双平台分布（小红书 / 抖音，作品 / 客资 / 流量）
 * - postVolumeTrend 作品量趋势（按 day/week/month 桶聚合）
 * - postTypeDistribution 三类作品占比（人设贴 / 讨论贴 / 获客帖）
 * - leadTrend 获客趋势（三条曲线：xhs / douyin / total）
 * - trafficTrend 流量趋势（三条曲线：xhs / douyin / total）
 * - leadEfficiency 获客效率（xhs / douyin / total，客资/作品）
 * - leadPostEfficiency 获客帖效率（xhs / douyin / total，客资/获客帖）
 */
export type SupervisorExtended = {
  period: { from: string; to: string; trendPeriod: 'day' | 'week' | 'month' };
  platformDistribution: Array<{ platform: string; postCount: number; leadCount: number; traffic: number }>;
  postVolumeTrend: Array<{ date: string; xiaohongshuCount: number; douyinCount: number }>;
  postTypeDistribution: Array<{ type: string; count: number; ratio: string }>;
  leadTrend: Array<{ date: string; xiaohongshuLeads: number; douyinLeads: number }>;
  trafficTrend: Array<{ date: string; xiaohongshuTraffic: number; douyinTraffic: number }>;
  leadEfficiency: { xiaohongshu: number; douyin: number; total: number };
  leadPostEfficiency: { xiaohongshu: number; douyin: number; total: number };
};

export async function getSupervisorOverview(period: string = 'today', from?: string, to?: string): Promise<SupervisorOverview | undefined> {
  const query: Record<string, string> = { period };
  if (from) query.from = from;
  if (to) query.to = to;
  const payload = await apiClient.get<RawRecord>('/dashboard/supervisor/overview', {
    query,
  }).catch(() => undefined);
  if (!payload) return undefined;
  return {
    period: payload.period as SupervisorOverview['period'] ?? { from: '', to: '', code: period },
    postCount: numberValue(payload.postCount),
    leadCount: numberValue(payload.leadCount),
    likes: numberValue(payload.likes),
    interactions: numberValue(payload.interactions),
    effectiveAccountCount: numberValue(payload.effectiveAccountCount),
    dealCount: numberValue(payload.dealCount),
    pendingCollaborationCount: numberValue(payload.pendingCollaborationCount),
    riskReminders: {
      collaborationTimeout: numberValue((payload.riskReminders as RawRecord)?.collaborationTimeout),
      leadBacklog: numberValue((payload.riskReminders as RawRecord)?.leadBacklog),
      lowUpdateEmployees: numberValue((payload.riskReminders as RawRecord)?.lowUpdateEmployees),
      abnormalAccounts: numberValue((payload.riskReminders as RawRecord)?.abnormalAccounts),
    },
  };
}

export async function getSupervisorAnalysis(
  filters: { platform?: string; employeeId?: string; accountId?: string; from?: string; to?: string; period?: string } = {},
  options: { signal?: AbortSignal } = {},
): Promise<SupervisorAnalysis | undefined> {
  const payload = await apiClient.get<RawRecord>('/dashboard/supervisor/analysis', {
    query: filters,
    signal: options.signal,
  });
  if (!payload) return undefined;
  return {
    filters: (payload.filters as SupervisorAnalysis['filters']) ?? { platform: null, employeeId: '', accountId: '', from: '', to: '' },
    platformTrend: (payload.platformTrend as SupervisorAnalysis['platformTrend']) ?? [],
    postStructure: (payload.postStructure as SupervisorAnalysis['postStructure']) ?? [],
    leadTrend: (payload.leadTrend as SupervisorAnalysis['leadTrend']) ?? [],
    // T6.3
    trafficTrend: (payload.trafficTrend as SupervisorAnalysis['trafficTrend']) ?? [],
    efficiencyTrend: (payload.efficiencyTrend as SupervisorAnalysis['efficiencyTrend']) ?? [],
    leadEfficiencyTrend: (payload.leadEfficiencyTrend as SupervisorAnalysis['leadEfficiencyTrend']) ?? [],
    // T6.4
    efficiencyRatio: (payload.efficiencyRatio as SupervisorAnalysis['efficiencyRatio']) ?? [],
    leadPostRatio: (payload.leadPostRatio as SupervisorAnalysis['leadPostRatio']) ?? [],
  };
}

/**
 * T1.3 主管总览扩展：补齐 7 个区域（双平台分布 / 作品量趋势 / 三类作品占比 /
 * 获客趋势 / 流量趋势 / 获客效率 / 获客帖效率）。
 * 与 supervisor/overview 共享 from/to 区间。
 */
export async function getSupervisorExtended(
  period: string = 'today',
  from?: string,
  to?: string,
  trendPeriod: 'day' | 'week' | 'month' = 'day',
): Promise<SupervisorExtended | undefined> {
  const query: Record<string, string> = { period, trendPeriod };
  if (from) query.from = from;
  if (to) query.to = to;
  const payload = await apiClient.get<RawRecord>('/dashboard/supervisor/overview/extended', {
    query,
  }).catch(() => undefined);
  if (!payload) return undefined;
  // W6 修复：对嵌套数组/对象使用防御性映射，避免后端返回非预期类型时静默穿透
  const dist = Array.isArray(payload.platformDistribution) ? payload.platformDistribution : [];
  const volTrend = Array.isArray(payload.postVolumeTrend) ? payload.postVolumeTrend : [];
  const typeDist = Array.isArray(payload.postTypeDistribution) ? payload.postTypeDistribution : [];
  const lTrend = Array.isArray(payload.leadTrend) ? payload.leadTrend : [];
  const tTrend = Array.isArray(payload.trafficTrend) ? payload.trafficTrend : [];

  const mapEfficiencyObj = (obj: unknown): { xiaohongshu: number; douyin: number; total: number } => {
    const raw = (obj ?? {}) as RawRecord;
    return { xiaohongshu: numberValue(raw.xiaohongshu), douyin: numberValue(raw.douyin), total: numberValue(raw.total) };
  };

  return {
    period: (payload.period as SupervisorExtended['period']) ?? { from: '', to: '', trendPeriod },
    platformDistribution: dist.map((r: RawRecord) => ({
      platform: text(r.platform) ?? '',
      postCount: numberValue(r.postCount),
      leadCount: numberValue(r.leadCount),
      traffic: numberValue(r.traffic),
    })),
    postVolumeTrend: volTrend.map((r: RawRecord) => ({
      date: text(r.date) ?? '',
      xiaohongshuCount: numberValue(r.xiaohongshuCount),
      douyinCount: numberValue(r.douyinCount),
    })),
    postTypeDistribution: typeDist.map((r: RawRecord) => ({
      type: text(r.type) ?? '',
      count: numberValue(r.count),
      ratio: text(r.ratio) ?? '0%',
    })),
    leadTrend: lTrend.map((r: RawRecord) => ({
      date: text(r.date) ?? '',
      xiaohongshuLeads: numberValue(r.xiaohongshuLeads),
      douyinLeads: numberValue(r.douyinLeads),
    })),
    trafficTrend: tTrend.map((r: RawRecord) => ({
      date: text(r.date) ?? '',
      xiaohongshuTraffic: numberValue(r.xiaohongshuTraffic),
      douyinTraffic: numberValue(r.douyinTraffic),
    })),
    leadEfficiency: mapEfficiencyObj(payload.leadEfficiency),
    leadPostEfficiency: mapEfficiencyObj(payload.leadPostEfficiency),
  };
}
