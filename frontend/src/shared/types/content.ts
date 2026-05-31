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
