import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { NotificationItem } from '@/shared/types/notifications';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';

type RawNotification = Record<string, unknown>;

export type NotificationQuery = PageQuery & {
  status?: 'all' | 'unread';
  type?: string;
};

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function mapNotification(raw: RawNotification): NotificationItem {
  const readStatus = Number(raw.readStatus ?? raw.read_status ?? 0);
  const relatedType = text(raw.relatedType ?? raw.related_type ?? raw.targetType);
  const relatedId = text(raw.relatedId ?? raw.related_id ?? raw.targetId);
  const leadId = text(raw.leadId ?? raw.lead_id);
  const portType = text(raw.portType ?? raw.port_type);
  const notificationType = text(raw.notificationType ?? raw.typeCode ?? raw.type_code ?? raw.type) ?? 'system';
  return {
    id: text(raw.id) ?? '',
    notificationType,
    title: text(raw.title) ?? '消息提醒',
    content: text(raw.content ?? raw.message),
    unread: raw.unread !== undefined ? Boolean(raw.unread) : readStatus === 0,
    readAt: text(raw.readAt ?? raw.read_at) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at) ?? '',
    targetType: relatedType,
    targetId: relatedId ?? leadId,
    portType,
    routeHint: text(raw.routeHint ?? raw.route_hint) ?? buildRouteHint({
      notificationType,
      relatedType,
      relatedId,
      leadId,
      portType,
    }),
  };
}

function buildRouteHint(opts: {
  notificationType?: string;
  relatedType?: string;
  relatedId?: string;
  leadId?: string;
  portType?: string;
}): string | undefined {
  const { notificationType, relatedType, relatedId, leadId, portType } = opts;
  const normalizedType = relatedType?.toLowerCase();
  const targetId = leadId ?? relatedId;
  if (!normalizedType || !targetId) return undefined;
  const normalizedPort = portType === 'operations' ? 'operation' : portType;

  if (normalizedType.includes('collaboration')) {
    if (normalizedPort === 'operation') {
      return `/operation/collaboration?taskId=${relatedId ?? targetId}`;
    }
    return leadId ? `/sales/leads/${leadId}` : `/sales/collaboration?taskId=${relatedId ?? targetId}`;
  }

  if (normalizedType.includes('lead')) {
    if (
      normalizedPort === 'operation' ||
      notificationType === 'customer_added' ||
      notificationType === 'customer_not_passed'
    ) {
      return `/operation/leads?leadId=${targetId}`;
    }
    return `/sales/leads/${targetId}`;
  }

  if (normalizedType.includes('order')) {
    if (normalizedPort === 'academic') return `/academic/orders?orderId=${targetId}`;
    if (normalizedPort === 'admin') return `/admin/orders?orderId=${targetId}`;
    return `/sales/orders/${targetId}`;
  }
  return undefined;
}

export async function listNotifications(query: NotificationQuery = {}): Promise<PagedResult<NotificationItem> & { unreadCount: number }> {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const payload = await apiClient.get<unknown>('/notifications', {
    query: { ...query, status: query.status === 'unread' ? 'unread' : undefined, limit, offset },
  });
  const raw = (payload ?? {}) as { unreadCount?: number };
  const paged = normalizePagedResult<RawNotification>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    unreadCount: Number(raw.unreadCount ?? 0),
    items: paged.items.map(mapNotification),
  };
}

export async function markNotificationRead(id: string | number) {
  return apiClient.post(`/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead() {
  return apiClient.post('/notifications/read-all', {});
}
