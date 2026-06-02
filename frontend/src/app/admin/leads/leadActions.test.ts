import { describe, expect, it } from 'vitest';

import { buildLeadReassignPayload, buildLeadReminderPayload } from './leadActions';

describe('admin lead row actions', () => {
  it('builds reassignment payload with selected sales user and assigned status', () => {
    expect(buildLeadReassignPayload({ id: 'sales-1', name: '销售甲' })).toEqual({
      assignedSalesUserId: 'sales-1',
      assignedSalesUserName: '销售甲',
      status: 'assigned',
    });
  });

  it('builds a reminder payload from current lead and trims custom note', () => {
    expect(
      buildLeadReminderPayload(
        { id: 'lead-1', customerName: '客户A', salesName: '销售甲' },
        '  明天前完成首次触达  ',
      ),
    ).toEqual({
      message: '明天前完成首次触达',
      reason: '明天前完成首次触达',
      leadId: 'lead-1',
    });
  });
});
