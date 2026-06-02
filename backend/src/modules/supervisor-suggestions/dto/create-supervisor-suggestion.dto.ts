/**
 * 创建主管建议 DTO
 *
 * doc/v1.2-完整交付版-AB端任务分配.md 行 283-288：
 *   POST /api/supervisor-suggestions
 *     - operatorId 必填（目标运营 users.id）
 *     - postId / accountId 可选关联
 *     - content 必填，建议正文，≤ 1000 字
 */
export interface CreateSupervisorSuggestionDto {
  operatorId: string;
  postId?: string | null;
  accountId?: string | null;
  content: string;
}

export const SUPERVISOR_SUGGESTION_CONTENT_MAX = 1000;
