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
  createdAt?: string;
}

export interface AdminEmployee {
  id: string;
  employeeCode?: string;
  name: string;
  phone?: string | null;
  hireDate?: string | null;
  status?: string;
  createdAt?: string;
}

export interface AdminAccount {
  id: string;
  employeeId?: string;
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
