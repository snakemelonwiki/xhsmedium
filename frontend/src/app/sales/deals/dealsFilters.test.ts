import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';

import {
  buildSalesDealStatusFilter,
  formatSalesDealDateParam,
  normalizePaymentStatus,
  pickClientPaidValue,
  SALES_DEAL_FOLLOW_UP_STATUSES,
} from './dealsFilters';

describe('sales deals filters', () => {
  it('uses follow-up order statuses when no explicit status is selected', () => {
    expect(buildSalesDealStatusFilter('')).toEqual([
      'to_receive',
      'in_progress',
      'awaiting_client_info',
      'awaiting_teacher',
      'to_deliver',
      'completed',
      'closed',
    ]);
    expect(SALES_DEAL_FOLLOW_UP_STATUSES).toContain('to_receive');
  });

  it('uses the selected order status when provided', () => {
    expect(buildSalesDealStatusFilter('completed')).toEqual(['completed']);
  });

  it('prefers delivery finance paid amount over the list row value', () => {
    expect(pickClientPaidValue('1200.00', '300.00')).toBe('1200.00');
  });

  it('falls back to the list row paid amount when delivery finance is empty', () => {
    expect(pickClientPaidValue(null, '300.00')).toBe('300.00');
  });

  it('normalizes unsupported legacy paid statuses to partial', () => {
    expect(normalizePaymentStatus('paid')).toBe('paid');
    expect(normalizePaymentStatus('unpaid')).toBe('partial');
    expect(normalizePaymentStatus('refunded')).toBe('partial');
  });

  it('formats date filters as local MySQL datetime strings', () => {
    const date = dayjs('2026-06-14T18:30:00+08:00');

    expect(formatSalesDealDateParam(date, 'start')).toBe('2026-06-14 00:00:00');
    expect(formatSalesDealDateParam(date, 'end')).toBe('2026-06-14 23:59:59');
    expect(formatSalesDealDateParam(date, 'end')).not.toContain('T');
    expect(formatSalesDealDateParam(date, 'end')).not.toContain('Z');
  });
});
