import { NotificationType } from '../../constants/notification-types';

export interface CreateNotificationParams {
  receiverIds: string[];
  senderId?: string;
  portType: 'operations' | 'sales' | 'academic';
  typeCode: NotificationType;
  title: string;
  content?: string;
  relatedId?: string;
  relatedType?: 'lead' | 'collaboration_task' | 'order' | 'post' | 'export';
}

/**
 * 通知创建辅助函数
 * 使用示例：
 * await createNotification(notificationsService, {
 *   receiverIds: [salesUserId],
 *   portType: 'sales',
 *   typeCode: NotificationType.LEAD_ASSIGNED,
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
