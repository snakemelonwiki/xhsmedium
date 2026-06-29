import { apiClient } from './apiClient';

export type SupervisorSuggestionTarget = 'post' | 'account' | 'employee' | 'lead';

export interface CreateSupervisorSuggestionPayload {
  targetType: SupervisorSuggestionTarget;
  targetId: string;
  content: string;
}

export interface SupervisorSuggestionItem {
  id: string | number;
  content: string;
  createdByName?: string;
  createdAt: string;
  targetId?: string | number;
}

/**
 * 创建主管建议（POST /supervisor-suggestions）。
 * 后端会按 targetType 查接收者：
 *   - lead → 客资归属销售（role='sales'）
 *   - 其他 → 关联运营（role='staff'）
 * 接收者会收到 in-app 通知（notifications 表）。
 */
export async function createSupervisorSuggestion(
  payload: CreateSupervisorSuggestionPayload,
): Promise<{ ok: boolean; data?: unknown; message?: string }> {
  return apiClient.post<{ ok: boolean; data?: unknown; message?: string }>(
    '/supervisor-suggestions',
    payload as unknown as Record<string, unknown>,
  );
}

export async function listSupervisorSuggestions(
  targetType: SupervisorSuggestionTarget,
  targetId?: string,
  targetIds?: string,
): Promise<SupervisorSuggestionItem[]> {
  const params = new URLSearchParams();
  params.append('targetType', targetType);
  if (targetId) {
    params.append('targetId', targetId);
  }
  if (targetIds) {
    params.append('targetIds', targetIds);
  }
  const result = await apiClient.get<{ items: Array<Record<string, unknown>> }>(
    `/supervisor-suggestions?${params.toString()}`,
  );
  return (result.items || []).map((item) => ({
    id: item.id as string | number,
    content: (item.content as string) || '',
    createdByName: (item.created_by_name as string | undefined) || (item.createdByName as string | undefined),
    createdAt: (item.created_at as string) || (item.createdAt as string) || '',
    targetId: (item.target_id as string | number | undefined) || (item.targetId as string | number | undefined),
  }));
}
