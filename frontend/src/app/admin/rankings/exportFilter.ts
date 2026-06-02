type RankingExportFilterInput = {
  type: 'posts' | 'leads';
  period: 'today' | '7d' | '30d';
  platform?: '' | 'xhs' | 'douyin';
};

/**
 * 构造主管排行榜当前筛选导出参数。
 */
export function buildRankingExportFilter(input: RankingExportFilterInput): Record<string, string> {
  const filter: Record<string, string> = {
    type: input.type,
    period: input.period,
  };
  if (input.platform) {
    filter.platform = input.platform;
  }
  return filter;
}
