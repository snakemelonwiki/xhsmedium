import type { Dayjs } from 'dayjs';

export const SALES_DEAL_FOLLOW_UP_STATUSES = [
  'to_receive',
  'in_progress',
  'awaiting_client_info',
  'awaiting_teacher',
  'to_deliver',
  'completed',
  'closed',
] as const;

export function buildSalesDealStatusFilter(status: string): string[] {
  return status ? [status] : [...SALES_DEAL_FOLLOW_UP_STATUSES];
}

export function pickClientPaidValue(
  deliveryClientPaid: number | string | null | undefined,
  rowClientPaid: number | string | null | undefined,
): number | string | undefined {
  return deliveryClientPaid ?? rowClientPaid ?? undefined;
}

export function normalizePaymentStatus(value: unknown): 'partial' | 'paid' {
  return value === 'paid' ? 'paid' : 'partial';
}

export function formatSalesDealDateParam(value: Dayjs, boundary: 'start' | 'end'): string {
  const normalized = boundary === 'start' ? value.startOf('day') : value.endOf('day');
  return normalized.format('YYYY-MM-DD HH:mm:ss');
}
