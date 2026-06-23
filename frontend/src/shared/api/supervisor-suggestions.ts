import { apiClient } from './apiClient';

export type SupervisorSuggestionTarget = 'post' | 'account' | 'employee' | 'lead';

export interface CreateSupervisorSuggestionPayload {
  targetType: SupervisorSuggestionTarget;
  targetId: string;
  content: string;
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
