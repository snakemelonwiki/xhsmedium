import { describe, expect, it } from 'vitest';

import { buildLeadsExportFilter } from './exportFilter';

describe('buildLeadsExportFilter', () => {
  it('exports the supervisor all-leads scope with current pagination', () => {
    expect(buildLeadsExportFilter({ page: 2, pageSize: 50 })).toEqual({
      scope: 'all',
      page: 2,
      pageSize: 50,
      limit: 50,
      offset: 50,
    });
  });
});
