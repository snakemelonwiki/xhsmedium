import type { PageQuery } from '@/shared/types/pagination';

export type OrderScope = 'academic' | 'sales' | 'all';

export type OrderStatusCode =
  | 'to_receive'
  | 'in_progress'
  | 'awaiting_client_info'
  | 'awaiting_teacher'
  | 'to_deliver'
  | 'completed'
  | 'abnormal';

export type PaidStatusCode = 'unpaid' | 'partial' | 'paid';

export type HandoverStatusCode = 'pending' | 'handed_over' | 'accepted' | 'rejected';

export interface OrderItem {
  id: string;
  leadId?: string;
  salesUserId?: string;
  salesName?: string;
  academicUserId?: string | null;
  academicName?: string;
  serviceType?: string | null;
  amount?: string | null;
  paidStatus: PaidStatusCode | string;
  orderStatus: OrderStatusCode | string;
  handoverStatus?: HandoverStatusCode | string;
  remark?: string | null;
  // 教务端详情扩展字段（后端暂未全部返回，缺失时显示 '-'）
  deliveryRequirement?: string | null;
  materialStatus?: string | null;
  teacher?: string | null;
  salesSummary?: string | null;
  dealStatus?: string | null;
  dealAmount?: string | null;
  clientDegree?: string | null;
  clientMajorResearch?: string | null;
  clientTimeRequirement?: string | null;
  objectionPoint?: string | null;
  followAction?: string | null;
  followActionAt?: string | null;
  requirementNote?: string | null;
  intentionLevel?: string | null;
  nextFollowAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderFollowRecord {
  id: string;
  orderId: string;
  userId?: string;
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | null;
  createdAt?: string;
}

export interface OrderListQuery extends PageQuery {
  scope: OrderScope;
  status?: string;
  handoverStatus?: string;
  abnormal?: boolean;
}

// ─── 订单异常反馈 ──────────────────────────────────────────────────────────

export type AbnormalTypeCode =
  | 'client_uncooperative'
  | 'material_missing'
  | 'teacher_no_response'
  | 'cycle_risk'
  | 'payment_issue'
  | 'other';

export type ExpectedHelperCode = 'sales' | 'supervisor' | 'operation' | 'other';

export type AbnormalFeedbackStatus = 'open' | 'handling' | 'closed';

export interface OrderAbnormalFeedback {
  id: string;
  orderId: string;
  leadId?: string | null;
  reporterUserId: string;
  abnormalType: AbnormalTypeCode | string;
  description?: string | null;
  expectedHelper?: ExpectedHelperCode | string | null;
  status: AbnormalFeedbackStatus | string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  closedBy?: string | null;
  closeNote?: string | null;
}
