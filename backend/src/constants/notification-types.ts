/**
 * 通知类型定义 - 派生显示层
 *
 * N-P1-01: 与 `shared/notifications.ts` 统一为唯一 code 集合。
 * 本文件仅做"code → 中文 label"映射，不参与路由判断（路由判断只用
 * `shared/notifications.ts.NOTIFICATION_TYPES`）。如果路由判断误用了本 enum
 * 编译时仍能通过，但运行时会与 NOTIFICATION_TYPES 不一致——因此 P0 修复后
 * 业务代码全部走 NOTIFICATION_TYPES。
 *
 * 历史备注：
 * - 1.0 引入的 `SUPERVISOR_SUGGESTION` / `LEAD_DEAL_DONE` 已下线（无 spec
 *   触发点），保留为 @deprecated 避免误用，不在新数据中写入。
 * - `DEAL_CLOSED` 在 1.2 拆分为 ORDER_CREATED / ORDER_HANDED_OVER /
 *   ORDER_ACCEPTED；本文件保留 @deprecated 旧 label 仅供历史数据展示。
 */
import { NOTIFICATION_TYPES } from '../shared/notifications';

export type NotificationType =
  | typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES]
  | 'supervisor_suggestion' // @deprecated, no longer emitted
  | 'lead_deal_done'; // @deprecated, no longer emitted

// String-keyed map for back-compat with callers that import NotificationType as a value
// (e.g. switch statements). Build a union of {code, label} so callers can do
// `NotificationType.LEAD_ASSIGNED` and get the same string as NOTIFICATION_TYPES.LEAD_ASSIGNED.
export const NotificationType = {
  ...NOTIFICATION_TYPES,
  // legacy values retained only for historical read paths
  SUPERVISOR_SUGGESTION: 'supervisor_suggestion' as const,
  LEAD_DEAL_DONE: 'lead_deal_done' as const,
} as const;

export const NotificationTypeLabels: Record<NotificationType, string> = {
  [NOTIFICATION_TYPES.LEAD_ASSIGNED]: '新客资分配',
  [NOTIFICATION_TYPES.COLLAB_REQUESTED]: '协同申请',
  [NOTIFICATION_TYPES.COLLAB_HANDLED]: '协同已处理',
  [NOTIFICATION_TYPES.COLLABORATION_TIMEOUT]: '协同超时',
  [NOTIFICATION_TYPES.CUSTOMER_NOT_PASSED]: '客户未通过',
  [NOTIFICATION_TYPES.CUSTOMER_ADDED]: '客户已添加',
  [NOTIFICATION_TYPES.LEAD_SOURCE_CONFIRMED]: '客资来源已确认',
  [NOTIFICATION_TYPES.DEAL_CLOSED]: '订单已成交（历史）',
  [NOTIFICATION_TYPES.ORDER_CREATED]: '新订单已成交',
  [NOTIFICATION_TYPES.ORDER_HANDED_OVER]: '订单已交接',
  [NOTIFICATION_TYPES.ORDER_ACCEPTED]: '订单已被接收',
  [NOTIFICATION_TYPES.ORDER_UPDATED]: '订单更新',
  [NOTIFICATION_TYPES.ORDER_NODE_DUE]: '订单节点到期',
  [NOTIFICATION_TYPES.ORDER_NODE_OVERDUE]: '订单节点超时',
  [NOTIFICATION_TYPES.ORDER_ABNORMAL]: '订单异常',
  [NOTIFICATION_TYPES.IMPORT_DONE]: '导入完成',
  [NOTIFICATION_TYPES.EXPORT_DONE]: '导出完成',
  supervisor_suggestion: '主管建议（已下线）',
  lead_deal_done: '成交提醒（已下线）',
};
