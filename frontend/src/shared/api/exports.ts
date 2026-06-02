import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';

/**
 * 异步导出任务相关 API。
 * - createExport      → POST /api/exports
 * - listExports       → GET /api/exports （支持分页 / type 过滤）
 * - getExport         → GET /api/exports/:id
 * - downloadExportUrl → 返回相对下载路径，供 <a> 标签 / window.open 使用
 */
export type ExportTypeCode =
  | 'leads'
  | 'orders'
  | 'order_progress'
  | 'collaboration_records'
  | 'posts'
  | 'rankings'
  | 'accounts';

export type ExportType = ExportTypeCode;

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ExportFilter {
  status?: string;
  paidStatus?: string;
  salesUserId?: string;
  academicUserId?: string;
  orderId?: string;
  orderStatus?: string;
  scope?: 'academic' | 'sales' | 'all' | 'mine' | 'pool';
  from?: string;
  to?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface ExportTask {
  id: string;
  userId: string;
  exportType: ExportTypeCode | string;
  filter: ExportFilter;
  fileUrl?: string | null;
  status: ExportStatus | string;
  createdAt?: string;
  finishedAt?: string | null;
  updatedAt?: string;
}

export interface CreateExportInput {
  exportType: ExportTypeCode;
  filter?: ExportFilter;
  scope?: 'academic' | 'sales' | 'all' | 'mine' | 'pool';
}

export interface CreateExportResult {
  id: string;
  status: ExportStatus | string;
}

export function downloadExportUrl(id: string): string {
  // 浏览器 <a href> 导航无法携带 Authorization 头,所以把 token 拼到 query,
  // 由后端 JwtAuthMiddleware 从 query.token 兜底解析,避免 401 unauthorized。
  const path = `/api/exports/${encodeURIComponent(id)}/download`;
  if (typeof window === 'undefined') return path;
  const token = window.localStorage.getItem('xhsmedium.token');
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}

export async function createExport(input: CreateExportInput): Promise<CreateExportResult> {
  // 兼容：服务端 create() 从 body.filter 取筛选；scope 也可作为 filter 一部分
  const body: Record<string, unknown> = {
    exportType: input.exportType,
    filter: {
      ...(input.filter || {}),
      ...(input.scope ? { scope: input.scope } : {}),
    },
  };
  const result = await apiClient.post<{ ok: boolean; id: string; status: string }>(
    '/exports',
    body,
  );
  return { id: result.id, status: result.status };
}

export async function getExport(id: string): Promise<ExportTask> {
  return apiClient.get<ExportTask>(`/exports/${encodeURIComponent(id)}`);
}

export interface ListExportsQuery extends PageQuery {
  type?: ExportTypeCode | string;
}

export async function listExports(query: ListExportsQuery = {}): Promise<PagedResult<ExportTask>> {
  const pageSize = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = Number(query.offset ?? (page - 1) * pageSize);
  const payload = await apiClient.get<unknown>('/exports', {
    query: { ...query, limit: pageSize, offset },
  });
  const paged = normalizePagedResult<ExportTask>(payload);
  return {
    ...paged,
    page,
    pageSize,
    items: paged.items,
  };
}

export function exportDownloadUrl(id: string): string {
  return downloadExportUrl(id);
}

export async function createExportTask(
  exportType: ExportType,
  filter: ExportFilter = {},
): Promise<CreateExportResult> {
  return createExport({ exportType, filter });
}

export async function listExportTasks(
  query: ListExportsQuery = {},
): Promise<PagedResult<ExportTask>> {
  return listExports(query);
}
