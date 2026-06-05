export interface AdminLead {
  id: string;
  customerName: string;
  contact?: string;
  platform?: string;
  operatorName?: string;
  salesName?: string;
  status: string;
  addStatus?: string;
  processStatus?: string;
  collaborationStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  latestFollowNote?: string;
  latestFollowAt?: string;
  sourcePostTitle?: string;
  sourceAccountName?: string;
  accountId?: string;
  postId?: string;
  employeeId?: string;
  assignedSalesUserId?: string;
}

export interface AdminLeadsStats {
  total: number;
  filteredTotal: number;
  assigned: number;
  pending: number;
  byStatus: Record<string, number>;
  byAddStatus: Record<string, number>;
  byProcess: Record<string, number>;
}

export interface AdminEmployee {
  id: string;
  employeeCode?: string;
  name: string;
  phone?: string | null;
  hireDate?: string | null;
  status?: string;
  department?: string | null;
  createdAt?: string;
}

export interface AdminAccount {
  id: string;
  employeeId?: string;
  employeeName?: string;
  platform?: string;
  profileUrl?: string | null;
  accountName: string;
  accountUid?: string | null;
  persona?: string | null;
  positioning?: string | null;
  postingPlan?: string | null;
  status?: string;
  createdAt?: string;
}

export interface AdminDashboardSummary {
  updatedEmployees: number;
  updatedAccounts: number;
  xhsPosts: number;
  douyinPosts: number;
  todayLeads: number;
  todayDeals: number;
  douyinLikes: number;
  douyinComments: number;
  douyinFavorites: number;
  xhsLikes: number;
  xhsComments: number;
  xhsFavorites: number;
  douyinTraffic: number;
  xhsTraffic: number;
  // 异常订单数：后端尚未返回，前端默认 0；保留字段为后续对接。
  abnormalOrders?: number;
}

export interface AdminPostTypeDistribution {
  type: string;
  count: number;
  ratio?: string;
}

export interface AdminRankingRow {
  employeeId: string;
  name: string;
  accountCount: number;
  todayPosts: number;
  todayLeads: number;
  todayTraffic: number;
  todayDeals: number;
  postCount?: number;
  xhsPostCount?: number;
  douyinPostCount?: number;
  leadCount?: number;
}
