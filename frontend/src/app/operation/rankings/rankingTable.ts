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
  | 'leadCount'
  | 'xhsLeadCount'
  | 'douyinLeadCount'
  | 'traffic'
  | 'xhsTraffic'
  | 'douyinTraffic'
  | 'todayDeals';

const POSTS_METRIC_KEYS: OperationRankingMetricKey[] = [
  'accountCount',
  'postCount',
  'xhsPostCount',
  'douyinPostCount',
  'todayDeals',
];

const LEADS_METRIC_KEYS: OperationRankingMetricKey[] = [
  'accountCount',
  'leadCount',
  'xhsLeadCount',
  'douyinLeadCount',
  'todayDeals',
];

const TRAFFIC_METRIC_KEYS: OperationRankingMetricKey[] = [
  'accountCount',
  'traffic',
  'xhsTraffic',
  'douyinTraffic',
  'todayDeals',
];

/**
 * 获取运营排行榜合并主榜指标列。
 * 排序口径影响前端展示指标集合：
 * - posts: 作品数 / 小红书作品数 / 抖音作品数
 * - leads: 客资数 / 小红书客资数 / 抖音客资数
 * - traffic: 总流量 / 小红书流量 / 抖音流量
 */
export function getOperationRankingMetricKeys(type: string): OperationRankingMetricKey[] {
  if (type === 'leads') return [...LEADS_METRIC_KEYS];
  if (type === 'traffic') return [...TRAFFIC_METRIC_KEYS];
  return [...POSTS_METRIC_KEYS];
}
