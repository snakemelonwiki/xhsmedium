type RankingExportFilterInput = {
  type: 'posts' | 'leads';
  period?: string;
  from?: string;
  to?: string;
  platform?: '' | 'xhs' | 'douyin';
};

/**
 * 构造主管排行榜当前筛选导出参数。
 */
export function buildRankingExportFilter(input: RankingExportFilterInput): Record<string, string> {
  const filter: Record<string, string> = {
    type: input.type,
    period: input.period ?? 'today',
  };
  if (input.from && input.to) {
    filter.from = input.from;
    filter.to = input.to;
  }
  if (input.platform) {
    filter.platform = input.platform;
  }
  return filter;
}
