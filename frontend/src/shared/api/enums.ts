/**
 * 跨页面复用的状态/枚举显示映射。
 * 与后端 schema/枚举保持同步，code 永远使用英文下划线字符串。
 * 后续如果后端做状态机统一映射，HANDOVER_STATUS 与 ORDER_STATUS 仍可作为显示层别名消费。
 */

export const HANDOVER_STATUS = {
  pending: { label: '待交接', color: 'default' },
  handed_over: { label: '已交接', color: 'orange' },
  accepted: { label: '已接收', color: 'green' },
  rejected: { label: '已拒收', color: 'red' },
} as const;

export type HandoverStatusCode = keyof typeof HANDOVER_STATUS;

export const HANDOVER_STATUS_OPTIONS: { label: string; value: HandoverStatusCode | '' }[] = [
  { label: '全部交接', value: '' },
  { label: '待交接', value: 'pending' },
  { label: '已交接', value: 'handed_over' },
  { label: '已接收', value: 'accepted' },
  { label: '已拒收', value: 'rejected' },
];

// v1.3 销售端订单付款状态 P0 修复：集中字典，避免详情/列表/导出出现 raw enum。
// 与后端 Order.paidStatus enum 保持一致（orders.service.ts:ALLOWED_PAID）。
// 后端目前 4 个值（unpaid / partial / paid / refunded），DB 实际只有前 3 个，
// 但 refunded 仍纳入映射以兼容未来数据。
export const PAID_STATUS = {
  unpaid: { label: '未付款', color: 'default' },
  partial: { label: '部分付款', color: 'gold' },
  paid: { label: '已付清', color: 'green' },
  refunded: { label: '已退款', color: 'red' },
} as const;

export type PaidStatusCode = keyof typeof PAID_STATUS;

// v1.3 订单状态（order_status）集中字典，覆盖 backend Order.orderStatus enum 的所有 9 个值。
// pending_accept / closed 暂未在 DB 出现（见真实数据），但仍纳入映射以避免 raw enum 穿透。
// 关键值：to_receive 沿用「待领取」（与原 OrderTable 下拉选项一致，避免回归 AC-1-008 / SA-9-001）。
export const ORDER_STATUS = {
  pending_accept: { label: '待接单', color: 'default' },
  to_receive: { label: '待领取', color: 'orange' },
  in_progress: { label: '进行中', color: 'blue' },
  awaiting_client_info: { label: '待客户资料', color: 'gold' },
  awaiting_teacher: { label: '待老师', color: 'purple' },
  to_deliver: { label: '待交付', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  abnormal: { label: '异常', color: 'red' },
  closed: { label: '已关闭', color: 'default' },
} as const;

export type OrderStatusCode = keyof typeof ORDER_STATUS;

export function handoverStatusMeta(code: string | null | undefined): { label: string; color: string } {
  if (!code) return { label: '-', color: 'default' };
  const meta = (HANDOVER_STATUS as Record<string, { label: string; color: string } | undefined>)[code];
  return meta ?? { label: code, color: 'default' };
}

export function paidStatusMeta(code: string | null | undefined): { label: string; color: string } {
  if (!code) return { label: '-', color: 'default' };
  const meta = (PAID_STATUS as Record<string, { label: string; color: string } | undefined>)[code];
  return meta ?? { label: code, color: 'default' };
}

export function orderStatusMeta(code: string | null | undefined): { label: string; color: string } {
  if (!code) return { label: '-', color: 'default' };
  const meta = (ORDER_STATUS as Record<string, { label: string; color: string } | undefined>)[code];
  return meta ?? { label: code, color: 'default' };
}
