type LeadsExportFilterInput = {
  page: number;
  pageSize: number;
};

/**
 * 构造主管客资当前筛选导出参数。
 */
export function buildLeadsExportFilter(input: LeadsExportFilterInput): Record<string, string | number> {
  const page = Math.max(Number(input.page) || 1, 1);
  const pageSize = Math.max(Number(input.pageSize) || 20, 1);
  return {
    scope: 'all',
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
