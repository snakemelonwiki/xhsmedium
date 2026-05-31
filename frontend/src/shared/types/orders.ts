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
  remark?: string | null;
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
}
