import { describe, expect, it } from 'vitest';

import type { SalesLead } from '@/shared/types/leads';
import { buildOperationReminderTarget } from './leadReminderTarget';

describe('sales lead reminder target', () => {
  it('uses the operator who submitted the lead as operation reminder recipient', () => {
    const lead = {
      id: 'lead-1',
      customerName: '客户A',
      status: 'assigned',
      operator: { id: 'op-1', name: '运营甲' },
      sales: { id: 'sales-1', name: '销售乙' },
    } satisfies SalesLead;

    expect(buildOperationReminderTarget(lead)).toEqual({
      recipientId: 'op-1',
      recipientName: '运营甲',
    });
  });

  it('returns empty values when the lead has no operator', () => {
    const lead = {
      id: 'lead-2',
      customerName: '客户B',
      status: 'assigned',
      sales: { id: 'sales-1', name: '销售乙' },
    } satisfies SalesLead;

    expect(buildOperationReminderTarget(lead)).toEqual({
      recipientId: '',
      recipientName: undefined,
    });
  });
});
