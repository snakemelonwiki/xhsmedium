import { describe, expect, it } from 'vitest';

import { buildOperationLeadsExportFilter } from './exportFilter';

describe('buildOperationLeadsExportFilter', () => {
  it('keeps operation leads export scoped to current filters', () => {
    expect(buildOperationLeadsExportFilter({
      page: 2,
      pageSize: 20,
      platform: 'xiaohongshu',
      status: 'assigned',
      processStatus: 'not_contacted',
      addStatus: 'not_added',
      collaborationStatus: 'pending',
      search: 'wx-1',
      sourceAccountId: 'account-1',
      from: '2026-06-02 00:00:00',
      to: '2026-06-06 23:59:59',
    })).toEqual({
      scope: 'self',
      page: 2,
      pageSize: 20,
      limit: 20,
      offset: 20,
      platform: 'xiaohongshu',
      status: 'assigned',
      processStatus: 'not_contacted',
      addStatus: 'not_added',
      collaborationStatus: 'pending',
      search: 'wx-1',
      sourceAccountId: 'account-1',
      from: '2026-06-02 00:00:00',
      to: '2026-06-06 23:59:59',
    });
  });
});
