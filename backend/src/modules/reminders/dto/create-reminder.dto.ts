/**
 * DTO for POST /api/reminders
 *
 * v1.3 CROSS-3: 销售/运营/主管/教务 四角色互相提醒。
 * Body 字段：recipientId / recipientRole / relatedType / relatedId / content
 * 落地为 notifications 表记录（typeCode = 'reminder'），同时通过 Socket.IO
 *   - 始终推送 notification.created / notification:new
 *   - 按 typeCode 额外推送 reminder.created（见 notifications.gateway.ts）
 */

export const REMINDER_RECIPIENT_ROLES = ['sales', 'operation', 'supervisor', 'academic'] as const;
export type ReminderRecipientRole = (typeof REMINDER_RECIPIENT_ROLES)[number];

export const REMINDER_RELATED_TYPES = ['lead', 'order', 'post', 'account'] as const;
export type ReminderRelatedType = (typeof REMINDER_RELATED_TYPES)[number];

export const REMINDER_PRIORITIES = ['normal', 'urgent'] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export class CreateReminderDto {
  /** 收件人用户 ID（users.id） */
  recipientId!: string;
  /** 收件人角色：销售/运营/主管/教务 */
  recipientRole!: ReminderRecipientRole;
  /** 关联业务对象类型：lead / order / post / account；可选 */
  relatedType?: ReminderRelatedType;
  /** 关联业务对象 ID；可选 */
  relatedId?: string;
  /** 提醒正文（最多 500 字） */
  content!: string;
  /** 优先级：normal（默认）/ urgent；可选 */
  priority?: ReminderPriority;
}
