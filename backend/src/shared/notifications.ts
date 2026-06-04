/**
 * Notification type codes — single source of truth.
 *
 * Keep values in sync with the `notifications.type_code` column and any
 * frontend display map. Service code should always reference the constant
 * (e.g. NOTIFICATION_TYPES.LEAD_ASSIGNED) instead of the literal string.
 *
 * ## History / Splitting rules (N-P1-01, N-P1-02, N-P1-04)
 *
 * - `DEAL_CLOSED` (legacy): 1.0 时 closeDeal/handOver/acceptHandover 三处共用
 *   同一 type_code，导致无法在 UI 上区分。1.2 拆分为下面 3 个更细粒度的 code，
 *   旧数据中可能仍有 `deal_closed` 行，仅用于只读历史展示，不再有新写入。
 * - `ORDER_CREATED`：closeDeal（销售成单）触发
 * - `ORDER_HANDED_OVER`：销售主动 handOver（pending → handed_over）触发
 * - `ORDER_ACCEPTED`：教务 acceptHandover（handed_over → accepted）触发
 * - `ORDER_UPDATED`：1.2 补齐的订单进度更新（与 spec §11.1 对齐）
 *
 * `constants/notification-types.ts` 与 `constants/enums.js` 是**派生显示层**
 * （label/label-zh），不参与路由判断。所有路由判断只读这里的 code。
 */
export const NOTIFICATION_TYPES = {
  // ── 客资 / 协同 ───────────────────────────────────────────────────────
  LEAD_ASSIGNED: 'lead_assigned',
  COLLAB_REQUESTED: 'collaboration_requested',
  COLLAB_HANDLED: 'collaboration_handled',
  COLLABORATION_TIMEOUT: 'collaboration_timeout',
  CUSTOMER_NOT_PASSED: 'customer_not_passed',
  CUSTOMER_ADDED: 'customer_added',
  LEAD_SOURCE_CONFIRMED: 'lead_source_confirmed',

  // ── 订单 (1.2 拆分) ──────────────────────────────────────────────────
  /** @deprecated 1.2 起按 closeDeal / handOver / acceptHandover 拆分；保留仅供历史数据识别 */
  DEAL_CLOSED: 'deal_closed',
  /** closeDeal 触发：销售成单 → 通知教务/主管 */
  ORDER_CREATED: 'order_created',
  /** handOver 触发：销售主动交接 → 通知教务/主管 */
  ORDER_HANDED_OVER: 'order_handed_over',
  /** acceptHandover 触发：教务接单 → 通知销售 */
  ORDER_ACCEPTED: 'order_accepted',
  /** 1.2 P1-02 补齐：订单状态/进度更新 → 通知销售 + 主管兜底 */
  ORDER_UPDATED: 'order_updated',
  ORDER_NODE_DUE: 'order_node_due',
  /** 订单节点超时：跟进超过 7 天无进展 → 通知 admin/owner */
  ORDER_NODE_OVERDUE: 'order_node_overdue',
  ORDER_ABNORMAL: 'order_abnormal',

  // ── 导入 / 导出 ─────────────────────────────────────────────────────
  IMPORT_DONE: 'import_done',
  EXPORT_DONE: 'export_done',

  // ── 跨端口通用提醒（CROSS-3，v1.3）──────────────────────────────────
  /** 销售/运营/主管三角色互相发送的提醒（POST /api/reminders） */
  REMINDER: 'reminder',
} as const;

export type NotificationTypeCode =
  typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

/** Set of all currently-emitted type codes (excludes deprecated). */
export const ACTIVE_NOTIFICATION_CODES: ReadonlySet<NotificationTypeCode> = new Set([
  NOTIFICATION_TYPES.LEAD_ASSIGNED,
  NOTIFICATION_TYPES.COLLAB_REQUESTED,
  NOTIFICATION_TYPES.COLLAB_HANDLED,
  NOTIFICATION_TYPES.COLLABORATION_TIMEOUT,
  NOTIFICATION_TYPES.CUSTOMER_NOT_PASSED,
  NOTIFICATION_TYPES.CUSTOMER_ADDED,
  NOTIFICATION_TYPES.LEAD_SOURCE_CONFIRMED,
  NOTIFICATION_TYPES.ORDER_CREATED,
  NOTIFICATION_TYPES.ORDER_HANDED_OVER,
  NOTIFICATION_TYPES.ORDER_ACCEPTED,
  NOTIFICATION_TYPES.ORDER_UPDATED,
  NOTIFICATION_TYPES.ORDER_NODE_DUE,
  NOTIFICATION_TYPES.ORDER_NODE_OVERDUE,
  NOTIFICATION_TYPES.ORDER_ABNORMAL,
  NOTIFICATION_TYPES.IMPORT_DONE,
  NOTIFICATION_TYPES.EXPORT_DONE,
  NOTIFICATION_TYPES.REMINDER,
] as NotificationTypeCode[]);
