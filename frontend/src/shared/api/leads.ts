import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PagedResult, PageQuery } from '@/shared/types/pagination';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';

type RawRecord = Record<string, unknown>;

export type PassiveLeadCandidate = {
  id: string;
  nickname?: string;
  contactInfo?: string;
  platform?: string;
  createdAt?: string;
};

export type PassiveLeadQuery = PageQuery & {
  phone?: string;
  wechat?: string;
  nickname?: string;
};

export type BindPassiveLeadBody = {
  leadId: string | number;
  contact: string;
  salesFeedback?: string;
};

export type CreatePassiveLeadBody = {
  contact: string;
  nickname?: string;
  platform?: string;
  salesFeedback?: string;
};

export type ConfirmLeadSourceBody = {
  leadId: string | number;
  matchedPostId: string | number;
  sourceOperatorId?: string | number;
};

export type CreateCollaborationTaskBody = {
  leadId: string | number;
  type: string;
  urgency?: 'normal' | 'urgent' | 'critical' | string;
  reason: string;
  remark?: string;
  /** 期望处理时间（ISO 字符串或 yyyy-MM-ddTHH:mm）；后端暂未消费，预留给 1.2 排期使用 */
  expectedHandleTime?: string | null;
};

export type CloseLeadDealPayload = {
  amount?: number | string | null;
  serviceType?: string | null;
  contractStatus?: 'unsigned' | 'signed' | 'pending' | string;
  paidStatus?: 'unpaid' | 'partial' | 'paid' | string;
  deliveryRequirement?: string | null;
  expectedHandleTime?: string | null;
};

export type SalesHomeSummary = {
  newAssigned: number;
  pendingAdd: number;
  notPassed: number;
  pendingCommunicate: number;
  todayFollowups: number;
  pendingOrders: number;
};

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function idText(value: unknown): string {
  return text(value) ?? '';
}

function mapLead(raw: RawRecord): SalesLead {
  return {
    id: idText(raw.id),
    customerName: text(raw.customerName) ?? text(raw.nickname) ?? text(raw.contactInfo) ?? '未命名客户',
    nickname: text(raw.nickname),
    contact: text(raw.contact) ?? text(raw.contactInfo),
    phone: text(raw.phone),
    wechat: text(raw.wechat),
    source: {
      platform: text(raw.platform),
      accountId: text(raw.sourceAccountId) ?? text(raw.source_account_id) ?? text(raw.accountId),
      accountName: text(raw.sourceAccountName) ?? text(raw.source_account_name) ?? text(raw.accountName),
      postId: text(raw.sourcePostId) ?? text(raw.source_post_id) ?? text(raw.postId),
      postTitle: text(raw.sourcePostTitle) ?? text(raw.source_post_title) ?? text(raw.postTitle),
      postUrl: text(raw.sourcePostUrl) ?? text(raw.source_post_url) ?? text(raw.postUrl),
    },
    operator: {
      id: text(raw.employeeId) ?? text(raw.operatorId),
      name: text(raw.employeeName) ?? text(raw.operatorName),
    },
    sales: {
      id: text(raw.assignedSalesUserId) ?? text(raw.assigned_sales_user_id) ?? text(raw.salesId),
      name: text(raw.assignedSalesUserName) ?? text(raw.assigned_sales_user_name) ?? text(raw.salesName),
    },
    assignedAt: text(raw.assignedAt) ?? text(raw.createdAt),
    updatedAt: text(raw.updatedAt) ?? text(raw.updated_at) ?? text(raw.salesUpdatedAt),
    status: text(raw.status) ?? 'new',
    addStatus: text(raw.addStatus) ?? 'not_added',
    processStatus: text(raw.processStatus) ?? 'not_contacted',
    collaborationStatus: text(raw.collaborationStatus) ?? 'none',
    latestFollowNote: text(raw.latestFollowNote) ?? text(raw.salesFeedback),
    latestFollowAt: text(raw.latestFollowAt) ?? text(raw.lastFollowAt) ?? text(raw.followedAt),
    nextFollowAt: text(raw.nextFollowTime) ?? text(raw.next_follow_time) ?? text(raw.nextFollowAt) ?? text(raw.next_follow_at),
    note: text(raw.note),
    captureImageUrl: text(raw.captureImageUrl) ?? text(raw.capture_image_url),
    leadCode: text(raw.leadCode) ?? text(raw.lead_code),
    addMethod: text(raw.addMethod) ?? text(raw.add_method),
    ip: text(raw.ip),
    requirementNote: text(raw.requirementNote) ?? text(raw.requirement_note),
    supervisorNote: text(raw.supervisorNote) ?? text(raw.supervisor_note),
  };
}

function mapTimelineItem(raw: RawRecord, kind: 'follow' | 'collaboration'): LeadTimelineItem {
  const status = text(raw.status) ?? text(raw.processStatus);
  return {
    id: idText(raw.id),
    kind,
    title: text(raw.title) ?? (kind === 'follow' ? '跟进记录' : collaborationTitle(raw)),
    content: [text(raw.content) ?? text(raw.reason), text(raw.remark) ?? text(raw.note), text(raw.handledNote)]
      .filter(Boolean)
      .join('\n'),
    actorName: text(raw.actorName) ?? text(raw.userName) ?? text(raw.requesterName) ?? text(raw.salesName) ?? text(raw.operatorName),
    occurredAt: text(raw.occurredAt) ?? text(raw.createdAt) ?? text(raw.updatedAt) ?? '-',
    status: kind === 'collaboration' ? normalizeCollaborationStatus(status) : status,
    type: text(raw.type) ?? text(raw.taskType),
    priority: text(raw.urgency) ?? text(raw.priority),
    extra: raw,
  };
}

function collaborationTitle(raw: RawRecord): string {
  const type = text(raw.type) ?? text(raw.taskType);
  const typeLabel: Record<string, string> = {
    remind_customer: '提醒客户',
    complete_source: '补充来源',
    supplement_info: '补充来源',
    verify_identity: '确认身份',
    second_touch: '二次触达',
    second_contact: '二次触达',
  };
  return `协同记录${type ? ` · ${typeLabel[type] ?? type}` : ''}`;
}

function normalizeCollaborationStatus(status?: string): string | undefined {
  if (!status) return undefined;
  const aliases: Record<string, string> = {
    requested: 'pending',
    in_progress: 'handling',
    processing: 'handling',
    pending_operation: 'pending',
    done: 'handled',
    cancelled: 'closed',
    canceled: 'closed',
  };
  return aliases[status] ?? status;
}

function mapPassiveLead(raw: RawRecord): PassiveLeadCandidate {
  return {
    id: idText(raw.id),
    nickname: text(raw.nickname),
    contactInfo: text(raw.contactInfo) ?? text(raw.contact),
    platform: text(raw.platform),
    createdAt: text(raw.createdAt) ?? text(raw.created_at),
  };
}

export async function listSalesLeads(query: PageQuery = {}): Promise<PagedResult<SalesLead>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/leads', {
    query: { scope: 'self', ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapLead),
  };
}

export async function listTomorrowFollowups(query: PageQuery = {}): Promise<PagedResult<SalesLead>> {
  const limit = Number(query.pageSize ?? query.limit ?? 50);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/leads/tomorrow-followups', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapLead),
  };
}

export async function listPassiveLeadCandidates(query: PassiveLeadQuery = {}): Promise<PagedResult<PassiveLeadCandidate>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/leads/passive/candidates', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapPassiveLead),
  };
}

export async function getLeadDetail(id: string): Promise<SalesLead | undefined> {
  try {
    const payload = await apiClient.get<RawRecord>(`/leads/${id}`);
    return mapLead(payload);
  } catch {
    return undefined;
  }
}

export async function listLeadFollowRecords(id: string): Promise<LeadTimelineItem[]> {
  const payload = await apiClient.get<unknown>(`/leads/${id}/follow-records`, {
    query: { limit: 50, offset: 0 },
  });
  return normalizePagedResult<RawRecord>(payload).items.map((item) => mapTimelineItem(item, 'follow'));
}

export async function listCollaborationTasks(query: PageQuery = {}): Promise<PagedResult<LeadTimelineItem>> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/collaboration-tasks', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map((item) => mapTimelineItem(item, 'collaboration')),
  };
}

export async function createLeadFollowRecord(id: string, body: Record<string, unknown>) {
  return apiClient.post(`/leads/${id}/follow-records`, body);
}

export async function updateLeadBoard(id: string, body: Record<string, unknown>) {
  return apiClient.request(`/leads/${id}/board`, {
    method: 'PUT',
    body,
  });
}

export async function createCollaborationTask(body: CreateCollaborationTaskBody) {
  const { leadId, ...payload } = body;
  return apiClient.post(`/leads/${leadId}/collaboration`, payload);
}

export async function bindPassiveLead(body: BindPassiveLeadBody) {
  return apiClient.post('/leads/passive/bind', body);
}

export async function createPassiveLead(body: CreatePassiveLeadBody) {
  return apiClient.post('/leads/passive/new', body);
}

export async function confirmLeadSource({ leadId, matchedPostId, sourceOperatorId }: ConfirmLeadSourceBody) {
  return apiClient.post(`/leads/${leadId}/source-confirm`, {
    matchedPostId,
    sourceOperatorId,
  });
}

/**
 * 销售标记成交：调用后端 /api/leads/:id/close-deal，
 * 后端会在事务内创建订单并把 lead 状态推进到 handed_over。
 *
 * 字段对应后端 closeDeal：serviceType / amount / remark 等。
 * contractStatus / paidStatus / deliveryRequirement / expectedHandleTime
 * 是 v1.2 前端表单扩展字段，会原样透传；后端目前只消费 serviceType/amount/remark。
 */
export async function closeLeadDeal(id: string, body: CloseLeadDealPayload) {
  const payload = {
    amount: body.amount ?? null,
    serviceType: body.serviceType ?? null,
    contractStatus: body.contractStatus ?? null,
    paidStatus: body.paidStatus ?? null,
    deliveryRequirement: body.deliveryRequirement ?? null,
    expectedHandleTime: body.expectedHandleTime ?? null,
    remark: body.deliveryRequirement ?? null,
  };
  return apiClient.post<{ ok?: boolean; orderId?: string }>(`/leads/${id}/close-deal`, payload);
}

const EMPTY_SALES_HOME_SUMMARY: SalesHomeSummary = {
  newAssigned: 0,
  pendingAdd: 0,
  notPassed: 0,
  pendingCommunicate: 0,
  todayFollowups: 0,
  pendingOrders: 0,
};

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 销售端首页六宫格汇总。优先请求后端 /api/sales/home-summary；
 * 后端没有时（v1.2 文档约定的临时方案）回退到本地 mock 静态数字，
 * 后续真接口就绪后只需删除 try/catch 兜底即可。
 */
export async function getSalesHomeSummary(): Promise<SalesHomeSummary> {
  const payload = await apiClient
    .get<Partial<SalesHomeSummary> | null>('/sales/home-summary')
    .catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return EMPTY_SALES_HOME_SUMMARY;
  }
  return {
    newAssigned: numberOrZero((payload as SalesHomeSummary).newAssigned),
    pendingAdd: numberOrZero((payload as SalesHomeSummary).pendingAdd),
    notPassed: numberOrZero((payload as SalesHomeSummary).notPassed),
    pendingCommunicate: numberOrZero((payload as SalesHomeSummary).pendingCommunicate),
    todayFollowups: numberOrZero((payload as SalesHomeSummary).todayFollowups),
    pendingOrders: numberOrZero((payload as SalesHomeSummary).pendingOrders),
  };
}
