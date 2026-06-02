/**
 * 通知类型定义
 */
export enum NotificationType {
  LEAD_ASSIGNED = 'lead_assigned',
  COLLABORATION_REQUESTED = 'collaboration_requested',
  CUSTOMER_NOT_PASSED = 'customer_not_passed',
  COLLABORATION_HANDLED = 'collaboration_handled',
  CUSTOMER_ADDED = 'customer_added',
  ORDER_CREATED = 'order_created',
  ORDER_UPDATED = 'order_updated',
  ORDER_ABNORMAL = 'order_abnormal',
  EXPORT_FINISHED = 'export_finished',
  SUPERVISOR_SUGGESTION = 'supervisor_suggestion',
  LEAD_DEAL_DONE = 'lead_deal_done',
  COLLABORATION_TIMEOUT = 'collaboration_timeout',
}

export const NotificationTypeLabels: Record<NotificationType, string> = {
  [NotificationType.LEAD_ASSIGNED]: '新客资分配',
  [NotificationType.COLLABORATION_REQUESTED]: '协同申请',
  [NotificationType.CUSTOMER_NOT_PASSED]: '客户未通过',
  [NotificationType.COLLABORATION_HANDLED]: '协同已处理',
  [NotificationType.CUSTOMER_ADDED]: '客户已添加',
  [NotificationType.ORDER_CREATED]: '新订单',
  [NotificationType.ORDER_UPDATED]: '订单更新',
  [NotificationType.ORDER_ABNORMAL]: '订单异常',
  [NotificationType.EXPORT_FINISHED]: '导出完成',
  [NotificationType.SUPERVISOR_SUGGESTION]: '主管建议',
  [NotificationType.LEAD_DEAL_DONE]: '成交提醒',
  [NotificationType.COLLABORATION_TIMEOUT]: '协同超时',
};
