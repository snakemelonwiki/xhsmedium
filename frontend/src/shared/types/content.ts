export interface ContentPostMetrics {
  traffic: number;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  leadsCount: number;
}

export interface ContentPost {
  id: string;
  platform: string;
  title: string;
  copywriting?: string;
  accountId?: string;
  accountName?: string;
  employeeId?: string;
  employeeName?: string;
  postType?: string;
  postUrl?: string;
  coverImageUrl?: string;
  coverThumbUrl?: string;
  publishedAt?: string;
  metricsUpdatedAt?: string;
  note?: string;
  supervisorSuggestion?: string;
  isFavorited?: boolean;
  metrics: ContentPostMetrics;
}

export interface RankingRow {
  id: string;
  name: string;
  employeeId?: string;
  postCount: number;
  leadCount: number;
  todayPosts: number;
  todayLeads: number;
  todayTraffic: number;
  todayDeals: number;
  xhsPostCount?: number;
  douyinPostCount?: number;
}

export interface DashboardSummary {
  updatedEmployees: number;
  updatedAccounts: number;
  xhsPosts: number;
  douyinPosts: number;
  todayLeads: number;
  todayDeals: number;
  xhsLikes: number;
  xhsComments: number;
  xhsFavorites: number;
  xhsTraffic: number;
  douyinLikes: number;
  douyinComments: number;
  douyinFavorites: number;
  douyinTraffic: number;
}

export interface PostTypeDistribution {
  type: string;
  count: number;
  ratio?: string;
}

export interface ImportTask {
  id: string;
  importType: string;
  status: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  errorFileUrl?: string;
  createdAt?: string;
  finishedAt?: string;
}

// v1.3 OP-18: 双平台分布（饼图用）
export interface PlatformDistributionItem {
  platform: string; // '小红书' | '抖音'
  postCount: number;
  leadCount: number;
  traffic: number; // likes + comments + favorites
}

// v1.3 OP-19: 双平台作品量（柱状图用）
export interface PlatformTrendPoint {
  date: string;
  xiaohongshuCount: number;
  douyinCount: number;
  xiaohongshuTraffic: number;
  douyinTraffic: number;
  xiaohongshuLeads: number;
  douyinLeads: number;
}

export interface PlatformTrend {
  period: 'day' | 'week' | 'month';
  from: string;
  to: string;
  points: PlatformTrendPoint[];
}

// v1.3 OP-23: 账号时间序列（日历视图）
export interface AccountTimeseriesPost {
  postId: string;
  title: string;
  platform: string;
  type: string;
  isLead: boolean;
  leadCount: number;
  traffic: number;
}

export interface AccountTimeseriesDay {
  date: string;
  postCount: number;
  leadCount: number;
  traffic: number;
  posts: AccountTimeseriesPost[];
}

export interface AccountTimeseriesSummary {
  postCount: number;
  leadCount: number;
  traffic: number;
  highLeadDays: number; // 橙色
  lowLeadDays: number; // 绿色
  noPostDays: number; // 灰色
}

export interface AccountTimeseries {
  account: {
    id: string;
    accountName: string;
    platform: string;
    postingPlan: string;
    persona: string;
    positioning: string;
  };
  from: string;
  to: string;
  days: AccountTimeseriesDay[];
  summary: AccountTimeseriesSummary;
}
