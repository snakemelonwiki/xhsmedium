export type MainRankingType = 'posts' | 'leads';

export const MAIN_RANKING_TYPE_OPTIONS: Array<{ label: string; value: MainRankingType }> = [
  { label: '按作品', value: 'posts' },
  { label: '按客资', value: 'leads' },
];

export type OperationRankingMetricKey =
  | 'accountCount'
  | 'postCount'
  | 'xhsPostCount'
  | 'douyinPostCount'
  | 'todayDeals';

const MERGED_RANKING_METRIC_KEYS: OperationRankingMetricKey[] = [
  'accountCount',
  'postCount',
  'xhsPostCount',
  'douyinPostCount',
  'todayDeals',
];

/**
 * 获取运营排行榜合并主榜固定指标列。
 * 排序口径只影响后端 type，不影响前端展示指标集合。
 */
export function getOperationRankingMetricKeys(_type: MainRankingType): OperationRankingMetricKey[] {
  return [...MERGED_RANKING_METRIC_KEYS];
}
