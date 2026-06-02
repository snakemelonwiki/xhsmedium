export type AdminPostDetailSource = {
  id: string;
  title?: string;
  copywriting?: string | null;
  coverImageUrl?: string | null;
  coverThumbUrl?: string | null;
  traffic?: number | null;
  likes?: number | null;
  comments?: number | null;
  favorites?: number | null;
  supervisorSuggestion?: string | null;
};

type PostExportFilterInput = {
  employeeId?: string;
  platform?: string;
  keyword?: string;
};

/**
 * 构造主管作品看板当前筛选导出参数。
 */
export function buildPostExportFilter(input: PostExportFilterInput): Record<string, string> {
  const filter: Record<string, string> = {};
  if (input.employeeId) filter.employeeId = input.employeeId;
  if (input.platform) filter.platform = input.platform;
  if (input.keyword?.trim()) filter.search = input.keyword.trim();
  return filter;
}

function numeric(value: number | null | undefined): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

/**
 * 归一化主管作品详情弹窗展示字段。
 */
export function getPostDetailDisplay(post: AdminPostDetailSource) {
  return {
    copywriting: post.copywriting?.trim() || '暂无完整文案',
    screenshotUrl: post.coverImageUrl || post.coverThumbUrl || '',
    metrics: [
      { label: '流量', value: numeric(post.traffic) },
      { label: '赞', value: numeric(post.likes) },
      { label: '评', value: numeric(post.comments) },
      { label: '藏', value: numeric(post.favorites) },
    ],
    supervisorSuggestion: post.supervisorSuggestion || '',
  };
}
