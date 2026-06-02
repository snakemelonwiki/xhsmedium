/**
 * N-P1-01: 通知 helper 改用 `shared/notifications.ts` 的 typeCode 联合类型，
 * 与 NOTIFICATION_TYPES 严格对齐。原本 import 的 `constants/notification-types`
 * 仍有 @deprecated 字段（supervisor_suggestion / lead_deal_done / deal_closed），
 * 会污染编译期 union。本文件用 `NotificationTypeCode` 替代 `NotificationType`，
 * 让 IDE/编译器在 typeCode 写错时立即报错。
 */
import {
  NOTIFICATION_TYPES,
  type NotificationTypeCode,
} from '../../shared/notifications';

export interface CreateNotificationParams {
  receiverIds: string[];
  senderId?: string;
  portType: 'operations' | 'sales' | 'academic';
  typeCode: NotificationTypeCode;
  title: string;
  content?: string;
  relatedId?: string;
  relatedType?:
    | 'lead'
    | 'collaboration_task'
    | 'order'
    | 'post'
    | 'export'
    // N-P1-08 修复：补充 'import_task' / 'import'，与 notifications.service.ts
    // buildRouteHint 新分支保持一致。原 exports/imports 业务方实际使用
    // 'import_task'（imports.service.ts:286,376、posts-bulk-import.service.ts:340），
    // 此处同时保留 'import' 作兼容，匹配 buildRouteHint 的两个分支。
    | 'import_task'
    | 'import';
}

/**
 * 通知创建辅助函数
 * 使用示例：
 * await createNotification(notificationsService, {
 *   receiverIds: [salesUserId],
 *   portType: 'sales',
 *   typeCode: NOTIFICATION_TYPES.LEAD_ASSIGNED,
 *   title: '新客资分配',
 *   content: `您收到了一条新客资：${lead.nickname}`,
 *   relatedId: lead.id,
 *   relatedType: 'lead'
 * });
 */
export async function createNotification(
  notificationsService: any,
  params: CreateNotificationParams,
): Promise<void> {
  await notificationsService.create({
    receiverIds: params.receiverIds,
    senderId: params.senderId || null,
    portType: params.portType,
    typeCode: params.typeCode,
    title: params.title,
    content: params.content || null,
    relatedId: params.relatedId || null,
    relatedType: params.relatedType || null,
  });
}

export { NOTIFICATION_TYPES };
