/**
 * 客资状态枚举常量
 *
 * 提供类型安全的状态常量，避免硬编码字符串
 */

/**
 * 客资主状态枚举
 */
export const LeadStatus = {
  NEW: 'new' as const,
  ASSIGNED: 'assigned' as const,
  IN_FOLLOWUP: 'in_followup' as const,
  IN_COLLABORATION: 'in_collaboration' as const,
  OPERATION_HANDLED: 'operation_handled' as const,
  ADDED_SUCCESS: 'added_success' as const,
  INVALID: 'invalid' as const,
} as const;

/**
 * 添加状态枚举
 */
export const LeadAddStatus = {
  NOT_ADDED: 'not_added' as const,
  APPLIED: 'applied' as const,
  NOT_PASSED: 'not_passed' as const,
  OPERATION_REMINDED: 'operation_reminded' as const,
  ADDED: 'added' as const,
} as const;

/**
 * 处理状态枚举
 */
export const LeadProcessStatus = {
  NOT_CONTACTED: 'not_contacted' as const,
  WAITING_PASS: 'waiting_pass' as const,
  COMMUNICATING: 'communicating' as const,
  QUOTED: 'quoted' as const,
  DEAL_PENDING: 'deal_pending' as const,
  DEAL_DONE: 'deal_done' as const,
  INVALID: 'invalid' as const,
} as const;

/**
 * 协同状态枚举
 */
export const CollaborationStatus = {
  NONE: 'none' as const,
  REQUESTED: 'requested' as const,
  PENDING: 'pending' as const,
  IN_PROGRESS: 'in_progress' as const,
  HANDLED: 'handled' as const,
} as const;
