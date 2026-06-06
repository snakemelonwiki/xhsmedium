type OperationLeadsExportFilterInput = {
  page: number;
  pageSize: number;
  platform?: string;
  status?: string;
  processStatus?: string;
  addStatus?: string;
  collaborationStatus?: string;
  search?: string;
  sourceAccountId?: string;
  from?: string;
  to?: string;
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
  if (input.processStatus) filter.processStatus = input.processStatus;
  if (input.addStatus) filter.addStatus = input.addStatus;
  if (input.collaborationStatus) filter.collaborationStatus = input.collaborationStatus;
  if (input.search) filter.search = input.search;
  if (input.sourceAccountId) filter.sourceAccountId = input.sourceAccountId;
  if (input.from) filter.from = input.from;
  if (input.to) filter.to = input.to;

  return filter;
}
