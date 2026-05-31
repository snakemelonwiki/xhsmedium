import type { NotificationTypeCode } from '@/shared/constants/status';

export interface NotificationItem {
  id: string | number;
  notificationType: NotificationTypeCode | string;
  title: string;
  content?: string;
  unread?: boolean;
  readAt?: string | null;
  createdAt: string;
  targetType?: string;
  targetId?: string | number;
  portType?: string;
  routeHint?: string;
}

export interface NotificationSummary {
  unreadCount: number;
  items: NotificationItem[];
}
