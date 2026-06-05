import { apiClient } from '@/shared/api/apiClient';

/**
 * v1.3 CROSS-3 通用提醒 API。
 *
 * 与 notifications 模块共享同一张 notifications 表（typeCode = 'reminder'），
 * 前端可在任意业务对象详情/列表上嵌入"提醒"按钮调用本组接口。
 */

export const REMINDER_RECIPIENT_ROLES = ['sales', 'operation', 'supervisor'] as const;
export type ReminderRecipientRole = (typeof REMINDER_RECIPIENT_ROLES)[number];

/** 收件人角色枚举 → 中文标签。modal 头部展示用，避免直接显示 'sales' / 'operation' / 'supervisor'。 */
export const REMINDER_RECIPIENT_ROLE_LABELS: Record<ReminderRecipientRole, string> = {
  sales: '销售',
  operation: '运营',
  supervisor: '主管',
};

export const REMINDER_RELATED_TYPES = ['lead', 'order', 'post', 'account'] as const;
export type ReminderRelatedType = (typeof REMINDER_RELATED_TYPES)[number];

export const REMINDER_PRIORITIES = ['normal', 'urgent'] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export type CreateReminderPayload = {
  recipientId: string;
  recipientRole: ReminderRecipientRole;
  relatedType?: ReminderRelatedType;
  relatedId?: string;
  content: string;
  priority?: ReminderPriority;
};

export type CreatedReminder = {
  ok: true;
  notification: {
    id: string;
    receiverId: string;
    typeCode: string;
    title: string;
  };
};

/**
 * 发送提醒（销售/运营/主管三角色互相提醒）。
 * 落地为 notifications 表（typeCode = 'reminder'），同时 Socket.IO 推
 * notification.created + reminder.created 两个事件。
 */
export async function createReminder(payload: CreateReminderPayload): Promise<CreatedReminder> {
  return apiClient.post<CreatedReminder>('/reminders', payload);
}

/**
 * 当前用户的未读提醒数（typeCode = 'reminder'）。
 * 与 /api/notifications/unread-count（全量未读）区分。
 */
export async function getReminderUnreadCount(): Promise<{ unreadCount: number }> {
  return apiClient.get<{ unreadCount: number }>('/reminders/unread-count');
}

/**
 * 标记某条提醒为已读（仅收件人本人可调用）。
 */
export async function markReminderRead(id: string): Promise<{ ok: boolean; changed: boolean }> {
  return apiClient.patch<{ ok: boolean; changed: boolean }>(`/reminders/${id}/read`, {});
}
