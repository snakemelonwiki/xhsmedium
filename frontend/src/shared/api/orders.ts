import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';
import type { OrderFollowRecord, OrderItem, OrderListQuery } from '@/shared/types/orders';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function mapOrder(raw: RawRecord): OrderItem {
  return {
    id: text(raw.id) ?? '',
    leadId: text(raw.leadId ?? raw.lead_id),
    salesUserId: text(raw.salesUserId ?? raw.sales_user_id),
    salesName: text(raw.salesName ?? raw.sales_name ?? raw.salesUserName),
    academicUserId: text(raw.academicUserId ?? raw.academic_user_id) ?? null,
    academicName: text(raw.academicName ?? raw.academic_name ?? raw.academicUserName),
    serviceType: text(raw.serviceType ?? raw.service_type) ?? null,
    amount: text(raw.amount) ?? null,
    paidStatus: text(raw.paidStatus ?? raw.paid_status) ?? 'unpaid',
    orderStatus: text(raw.orderStatus ?? raw.order_status) ?? 'to_receive',
    handoverStatus: text(raw.handoverStatus ?? raw.handover_status) ?? 'pending',
    remark: text(raw.remark) ?? null,
    deliveryRequirement: text(raw.deliveryRequirement ?? raw.delivery_requirement) ?? null,
    materialStatus: text(raw.materialStatus ?? raw.material_status) ?? null,
    teacher: text(raw.teacher ?? raw.teacher_name) ?? null,
    salesSummary: text(raw.salesSummary ?? raw.sales_summary) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at),
    updatedAt: text(raw.updatedAt ?? raw.updated_at),
  };
}

function mapOrderFollowRecord(raw: RawRecord): OrderFollowRecord {
  return {
    id: text(raw.id) ?? '',
    orderId: text(raw.orderId ?? raw.order_id) ?? '',
    userId: text(raw.userId ?? raw.user_id),
    nodeType: text(raw.nodeType ?? raw.node_type) ?? '跟进记录',
    content: text(raw.content) ?? null,
    nextRemindAt: text(raw.nextRemindAt ?? raw.next_remind_at) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at),
  };
}

function withPaging(query: PageQuery): { page: number; pageSize: number; limit: number; offset: number } {
  const pageSize = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = Number(query.offset ?? (page - 1) * pageSize);
  return { page, pageSize, limit: pageSize, offset };
}

export async function listOrders(query: OrderListQuery): Promise<PagedResult<OrderItem>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  const payload = await apiClient.get<unknown>('/orders', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);

  return {
    ...paged,
    page,
    pageSize,
    items: paged.items.map(mapOrder),
  };
}

export async function getOrderDetail(id: string): Promise<OrderItem> {
  const payload = await apiClient.get<RawRecord>(`/orders/${id}`);
  return mapOrder(payload);
}

export async function listOrderFollowRecords(id: string): Promise<OrderFollowRecord[]> {
  const payload = await apiClient.get<unknown>(`/orders/${id}/follow-records`, {
    query: { limit: 50, offset: 0 },
  });
  return normalizePagedResult<RawRecord>(payload).items.map(mapOrderFollowRecord);
}

export async function updateOrder(id: string, body: Record<string, unknown>) {
  return apiClient.patch(`/orders/${id}`, body);
}

/**
 * 教务端新增一条订单跟进节点。nodeType 必填；含"异常"字样后端会向销售发 ORDER_ABNORMAL 通知。
 */
export async function createOrderFollowRecord(
  id: string,
  body: { nodeType: string; content?: string; nextRemindAt?: string | null },
) {
  return apiClient.post(`/orders/${id}/follow-records`, body);
}

// ─── 订单异常反馈 ──────────────────────────────────────────────────────────

export type AbnormalTypeCode =
  | 'client_uncooperative'
  | 'material_missing'
  | 'teacher_no_response'
  | 'cycle_risk'
  | 'payment_issue'
  | 'other';

export type ExpectedHelperCode = 'sales' | 'supervisor' | 'operation' | 'other';

export type AbnormalFeedbackStatus = 'open' | 'handling' | 'closed';

export interface OrderAbnormalFeedback {
  id: string;
  orderId: string;
  leadId?: string | null;
  reporterUserId: string;
  abnormalType: AbnormalTypeCode | string;
  description?: string | null;
  expectedHelper?: ExpectedHelperCode | string | null;
  status: AbnormalFeedbackStatus | string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  closedBy?: string | null;
  closeNote?: string | null;
}

function mapAbnormalFeedback(raw: RawRecord): OrderAbnormalFeedback {
  return {
    id: text(raw.id) ?? '',
    orderId: text(raw.orderId ?? raw.order_id) ?? '',
    leadId: text(raw.leadId ?? raw.lead_id) ?? null,
    reporterUserId: text(raw.reporterUserId ?? raw.reporter_user_id) ?? '',
    abnormalType: text(raw.abnormalType ?? raw.abnormal_type) ?? 'other',
    description: text(raw.description) ?? null,
    expectedHelper: text(raw.expectedHelper ?? raw.expected_helper) ?? null,
    status: text(raw.status) ?? 'open',
    createdAt: text(raw.createdAt ?? raw.created_at),
    updatedAt: text(raw.updatedAt ?? raw.updated_at),
    closedAt: text(raw.closedAt ?? raw.closed_at) ?? null,
    closedBy: text(raw.closedBy ?? raw.closed_by) ?? null,
    closeNote: text(raw.closeNote ?? raw.close_note) ?? null,
  };
}

/**
 * 提交一条订单异常反馈。
 * 后端会在事务内写入反馈、改 orders.orderStatus='abnormal'，并向销售+主管发通知。
 */
export async function createAbnormalFeedback(
  orderId: string,
  body: { abnormalType: AbnormalTypeCode | string; description?: string; expectedHelper?: ExpectedHelperCode | string },
) {
  return apiClient.post<{ ok: true; id: string }>(`/orders/${orderId}/abnormal-feedback`, body);
}

/**
 * 列出订单的全部异常反馈。
 * 返回顺序：按 createdAt 倒序。
 */
export async function listAbnormalFeedbacks(orderId: string): Promise<OrderAbnormalFeedback[]> {
  const payload = await apiClient.get<RawRecord>(`/orders/${orderId}/abnormal-feedback`);
  const items = Array.isArray(payload?.items)
    ? (payload.items as RawRecord[])
    : Array.isArray(payload)
      ? (payload as RawRecord[])
      : [];
  return items.map(mapAbnormalFeedback);
}

/**
 * 关闭（处理完成）一条异常反馈，可附带解决方案备注。
 */
export async function closeAbnormalFeedback(
  orderId: string,
  feedbackId: string,
  body: { closeNote?: string; status?: 'handling' | 'closed' } = {},
) {
  return apiClient.patch<{ ok: true }>(`/orders/${orderId}/abnormal-feedback/${feedbackId}/close`, body);
}

// ─── 订单交接状态机（文档 1.2） ──────────────────────────────────────────

export interface OrderHandoverStatus {
  orderId: string;
  handoverStatus: 'pending' | 'handed_over' | 'accepted' | 'rejected' | string;
  orderStatus: string;
  academicUserId: string | null;
  salesUserId: string;
}

/** 查询订单当前交接状态。 */
export async function getOrderHandover(orderId: string): Promise<OrderHandoverStatus> {
  const payload = await apiClient.get<{ ok: boolean } & OrderHandoverStatus>(`/orders/${orderId}/handover`);
  return {
    orderId: payload.orderId,
    handoverStatus: payload.handoverStatus,
    orderStatus: payload.orderStatus,
    academicUserId: payload.academicUserId ?? null,
    salesUserId: payload.salesUserId,
  };
}

/** 销售主动发起交接（pending → handed_over）。 */
export async function handOverOrder(orderId: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/hand-over`, {});
}

/** 教务接单（→ accepted，orderStatus 推 in_progress）。 */
export async function acceptHandoverOrder(orderId: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/accept`, {});
}

/** 教务拒收（→ rejected，必须传 reason）。 */
export async function rejectHandoverOrder(orderId: string, reason: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/reject`, { reason });
}
