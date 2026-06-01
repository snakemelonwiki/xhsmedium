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

export function handoverStatusMeta(code: string | null | undefined): { label: string; color: string } {
  if (!code) return { label: '-', color: 'default' };
  const meta = (HANDOVER_STATUS as Record<string, { label: string; color: string } | undefined>)[code];
  return meta ?? { label: code, color: 'default' };
}
