import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PagedResult, PageQuery } from '@/shared/types/pagination';

type RawOperationLog = Record<string, unknown>;

export type OperationLog = {
  id: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
};

export type OperationLogListQuery = PageQuery & {
  userId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: string;
  to?: string;
};

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function mapOperationLog(raw: RawOperationLog): OperationLog {
  return {
    id: text(raw.id) ?? '',
    userId: text(raw.userId ?? raw.user_id) ?? '',
    action: text(raw.action) ?? '',
    targetType: text(raw.targetType ?? raw.target_type) ?? '',
    targetId: text(raw.targetId ?? raw.target_id) ?? '',
    detail: text(raw.detail) ?? null,
    ip: text(raw.ip) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at) ?? '',
  };
}

function buildQuery(query: OperationLogListQuery) {
  const limit = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = query.offset ?? (page - 1) * limit;
  const result: Record<string, string | number> = { limit, offset };
  if (query.userId) result.userId = query.userId;
  if (query.targetType) result.targetType = query.targetType;
  if (query.targetId) result.targetId = query.targetId;
  if (query.action) result.action = query.action;
  if (query.from) result.from = query.from;
  if (query.to) result.to = query.to;
  return { limit, page, query: result };
}

/**
 * 获取操作日志列表（分页）。权限由后端 controller 控制：非 admin/owner
 * 会强制按本人 userId 过滤，调用方无需额外判断。
 */
export async function listOperationLogs(
  query: OperationLogListQuery = {},
): Promise<PagedResult<OperationLog>> {
  const { limit, page, query: requestQuery } = buildQuery(query);
  const payload = await apiClient.get<unknown>('/operation-logs', { query: requestQuery });
  const paged = normalizePagedResult<RawOperationLog>(payload);
  return {
    ...paged,
    page,
    pageSize: limit,
    items: paged.items.map(mapOperationLog),
  };
}

/**
 * 获取单条操作日志详情。非 admin/owner 只能查看自己的日志（后端已限制）。
 */
export async function getOperationLog(id: string): Promise<OperationLog> {
  const payload = await apiClient.get<RawOperationLog>(`/operation-logs/${id}`);
  return mapOperationLog(payload ?? {});
}
