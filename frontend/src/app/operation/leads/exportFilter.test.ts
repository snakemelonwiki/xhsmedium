import { describe, expect, it } from 'vitest';

import { buildOperationLeadsExportFilter } from './exportFilter';

describe('buildOperationLeadsExportFilter', () => {
  it('keeps operation leads export scoped to current filters', () => {
    expect(buildOperationLeadsExportFilter({
      page: 2,
      pageSize: 20,
      platform: 'xiaohongshu',
      status: 'assigned',
      search: 'wx-1',
    })).toEqual({
      scope: 'self',
      page: 2,
      pageSize: 20,
      limit: 20,
      offset: 20,
      platform: 'xiaohongshu',
      status: 'assigned',
      search: 'wx-1',
    });
  });
});
