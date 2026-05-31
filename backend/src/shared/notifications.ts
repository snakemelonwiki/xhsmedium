/**
 * Notification type codes — 10 categories per doc/B端-问题修复方案.md §11.1.
 * Keep values in sync with the `notifications.type_code` column and any
 * frontend display map. Service code should always reference the constant
 * (e.g. NOTIFICATION_TYPES.LEAD_ASSIGNED) instead of the literal string.
 */
export const NOTIFICATION_TYPES = {
  LEAD_ASSIGNED: 'lead_assigned',
  COLLAB_REQUESTED: 'collaboration_requested',
  COLLAB_HANDLED: 'collaboration_handled',
  CUSTOMER_NOT_PASSED: 'customer_not_passed',
  CUSTOMER_ADDED: 'customer_added',
  LEAD_SOURCE_CONFIRMED: 'lead_source_confirmed',
  DEAL_CLOSED: 'deal_closed',
  ORDER_NODE_DUE: 'order_node_due',
  ORDER_ABNORMAL: 'order_abnormal',
  IMPORT_DONE: 'import_done',
  EXPORT_DONE: 'export_done',
} as const;

export type NotificationTypeCode =
  typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
