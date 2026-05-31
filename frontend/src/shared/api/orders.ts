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
    remark: text(raw.remark) ?? null,
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
