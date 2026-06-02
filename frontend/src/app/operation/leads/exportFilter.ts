type OperationLeadsExportFilterInput = {
  page: number;
  pageSize: number;
  platform?: string;
  status?: string;
  search?: string;
};

/**
 * 构造运营客资当前筛选导出参数。
 */
export function buildOperationLeadsExportFilter(input: OperationLeadsExportFilterInput): Record<string, string | number> {
  const page = Math.max(Number(input.page) || 1, 1);
  const pageSize = Math.max(Number(input.pageSize) || 20, 1);
  const filter: Record<string, string | number> = {
    scope: 'self',
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  if (input.platform) filter.platform = input.platform;
  if (input.status) filter.status = input.status;
  if (input.search) filter.search = input.search;

  return filter;
}
