export type StatusRole = 'operation' | 'sales' | 'academic' | 'admin' | 'supervisor' | 'system';

export interface StatusMeta<Code extends string = string> {
  code: Code;
  label: string;
  color: string;
  role: StatusRole;
  actionHint: string;
}

export type LeadStatusCode =
  | 'new'
  | 'assigned'
  | 'in_followup'
  | 'in_collaboration'
  | 'operation_handled'
  | 'added_success'
  | 'invalid';

export type AddStatusCode =
  | 'not_added'
  | 'applied'
  | 'waiting_pass'
  | 'not_passed'
  | 'operation_reminded'
  | 'added';

export type ProcessStatusCode =
  | 'not_contacted'
  | 'waiting_pass'
  | 'communicating'
  | 'quoted'
  | 'deal_pending'
  | 'deal_done'
  | 'invalid';

export type CollaborationStatusCode = 'none' | 'pending' | 'handling' | 'handled' | 'closed' | 'timeout';

export type NotificationTypeCode =
  | 'lead_assigned'
  | 'collaboration_requested'
  | 'collaboration_handled'
  | 'collaboration_timeout'
  | 'customer_not_passed'
  | 'customer_added'
  | 'lead_source_confirmed'
  | 'lead_status_changed'
  | 'followup_reminder'
  | 'deal_closed'
  | 'order_created'
  | 'order_handed_over'
  | 'order_accepted'
  | 'order_updated'
  | 'order_node_due'
  | 'order_node_overdue'
  | 'order_abnormal'
  | 'import_done'
  | 'export_done';

export type StatusKind =
  | 'leadStatus'
  | 'addStatus'
  | 'processStatus'
  | 'collaborationStatus'
  | 'notificationType';

type StatusRegistry = {
  leadStatus: Record<LeadStatusCode, StatusMeta<LeadStatusCode>>;
  addStatus: Record<AddStatusCode, StatusMeta<AddStatusCode>>;
  processStatus: Record<ProcessStatusCode, StatusMeta<ProcessStatusCode>>;
  collaborationStatus: Record<CollaborationStatusCode, StatusMeta<CollaborationStatusCode>>;
  notificationType: Record<NotificationTypeCode, StatusMeta<NotificationTypeCode>>;
};

export const STATUS_META: StatusRegistry = {
  leadStatus: {
    new: { code: 'new', label: '新客资', color: 'blue', role: 'operation', actionHint: '分配给销售' },
    assigned: { code: 'assigned', label: '已分配', color: 'cyan', role: 'sales', actionHint: '开始跟进' },
    in_followup: { code: 'in_followup', label: '跟进中', color: 'geekblue', role: 'sales', actionHint: '更新跟进' },
    in_collaboration: { code: 'in_collaboration', label: '协同中', color: 'purple', role: 'operation', actionHint: '处理协同' },
    operation_handled: { code: 'operation_handled', label: '运营已处理', color: 'gold', role: 'sales', actionHint: '继续跟进' },
    added_success: { code: 'added_success', label: '已添加通过', color: 'green', role: 'sales', actionHint: '推进成交' },
    invalid: { code: 'invalid', label: '无效客资', color: 'red', role: 'sales', actionHint: '归档' },
  },
  addStatus: {
    not_added: { code: 'not_added', label: '未添加', color: 'default', role: 'sales', actionHint: '申请添加' },
    applied: { code: 'applied', label: '已申请添加', color: 'blue', role: 'sales', actionHint: '等待客户通过' },
    waiting_pass: { code: 'waiting_pass', label: '待通过', color: 'cyan', role: 'sales', actionHint: '跟进通过状态' },
    not_passed: { code: 'not_passed', label: '客户未通过', color: 'orange', role: 'operation', actionHint: '提醒客户' },
    operation_reminded: { code: 'operation_reminded', label: '运营已提醒', color: 'purple', role: 'sales', actionHint: '再次确认' },
    added: { code: 'added', label: '已添加通过', color: 'green', role: 'sales', actionHint: '进入沟通' },
  },
  processStatus: {
    not_contacted: { code: 'not_contacted', label: '未联系', color: 'default', role: 'sales', actionHint: '首次联系' },
    waiting_pass: { code: 'waiting_pass', label: '待通过', color: 'cyan', role: 'sales', actionHint: '等待通过' },
    communicating: { code: 'communicating', label: '沟通中', color: 'blue', role: 'sales', actionHint: '记录沟通' },
    quoted: { code: 'quoted', label: '已报价', color: 'gold', role: 'sales', actionHint: '推进成交' },
    deal_pending: { code: 'deal_pending', label: '待成交', color: 'orange', role: 'sales', actionHint: '确认订单' },
    deal_done: { code: 'deal_done', label: '已成交', color: 'green', role: 'sales', actionHint: '创建订单' },
    invalid: { code: 'invalid', label: '无效', color: 'red', role: 'sales', actionHint: '归档' },
  },
  collaborationStatus: {
    none: { code: 'none', label: '无协同', color: 'default', role: 'sales', actionHint: '可发起协同' },
    pending: { code: 'pending', label: '待领取', color: 'orange', role: 'operation', actionHint: '领取处理' },
    handling: { code: 'handling', label: '处理中', color: 'blue', role: 'operation', actionHint: '处理协同' },
    handled: { code: 'handled', label: '已处理', color: 'green', role: 'sales', actionHint: '查看结果' },
    closed: { code: 'closed', label: '已关闭', color: 'default', role: 'system', actionHint: '查看记录' },
    timeout: { code: 'timeout', label: '已超时', color: 'red', role: 'supervisor', actionHint: '升级处理' },
  },
  notificationType: {
    lead_assigned: { code: 'lead_assigned', label: '新客资分配', color: 'blue', role: 'sales', actionHint: '查看客资' },
    collaboration_requested: { code: 'collaboration_requested', label: '协同申请', color: 'purple', role: 'operation', actionHint: '处理协同' },
    collaboration_handled: { code: 'collaboration_handled', label: '协同已处理', color: 'green', role: 'sales', actionHint: '继续跟进' },
    collaboration_timeout: { code: 'collaboration_timeout', label: '协同超时', color: 'red', role: 'supervisor', actionHint: '处理超时' },
    customer_not_passed: { code: 'customer_not_passed', label: '客户未通过', color: 'orange', role: 'operation', actionHint: '提醒客户' },
    customer_added: { code: 'customer_added', label: '客户已添加', color: 'green', role: 'operation', actionHint: '查看客资' },
    lead_source_confirmed: { code: 'lead_source_confirmed', label: '客资来源已确认', color: 'cyan', role: 'sales', actionHint: '查看客资' },
    lead_status_changed: { code: 'lead_status_changed', label: '客资状态变更', color: 'cyan', role: 'sales', actionHint: '查看客资' },
    followup_reminder: { code: 'followup_reminder', label: '跟进提醒', color: 'orange', role: 'sales', actionHint: '处理跟进' },
    deal_closed: { code: 'deal_closed', label: '订单已成交（历史）', color: 'gold', role: 'sales', actionHint: '查看记录' },
    order_created: { code: 'order_created', label: '新订单已成交', color: 'blue', role: 'academic', actionHint: '接收订单' },
    order_handed_over: { code: 'order_handed_over', label: '订单已交接', color: 'blue', role: 'academic', actionHint: '接收订单' },
    order_accepted: { code: 'order_accepted', label: '订单已被接收', color: 'green', role: 'sales', actionHint: '查看进度' },
    order_updated: { code: 'order_updated', label: '订单更新', color: 'cyan', role: 'sales', actionHint: '查看进度' },
    order_node_due: { code: 'order_node_due', label: '订单节点到期', color: 'orange', role: 'academic', actionHint: '处理节点' },
    order_node_overdue: { code: 'order_node_overdue', label: '订单节点超时', color: 'red', role: 'supervisor', actionHint: '查看节点' },
    order_abnormal: { code: 'order_abnormal', label: '订单异常', color: 'red', role: 'sales', actionHint: '处理异常' },
    import_done: { code: 'import_done', label: '导入完成', color: 'green', role: 'admin', actionHint: '下载结果' },
    export_done: { code: 'export_done', label: '导出完成', color: 'green', role: 'admin', actionHint: '下载文件' },
  },
};

const STATUS_ALIASES: { [Kind in StatusKind]?: Record<string, keyof StatusRegistry[Kind]> } = {
  leadStatus: {
    in_collab: 'in_collaboration',
    op_handling: 'operation_handled',
    contact_added: 'added_success',
  },
  addStatus: {
    pending: 'waiting_pass',
    rejected: 'not_passed',
    op_reminded: 'operation_reminded',
  },
  processStatus: {
    applied: 'waiting_pass',
    pending: 'waiting_pass',
    passed: 'communicating',
    chatting: 'communicating',
    closed: 'deal_done',
  },
  collaborationStatus: {
    requested: 'pending',
    in_progress: 'handling',
    processing: 'handling',
    pending_operation: 'pending',
    done: 'handled',
    cancelled: 'closed',
    canceled: 'closed',
  },
  notificationType: {
    collab_requested: 'collaboration_requested',
    collab_handled: 'collaboration_handled',
    source_confirmed: 'lead_source_confirmed',
  },
};

export function normalizeStatusCode(kind: StatusKind, code: string | null | undefined): string {
  if (!code) return '';
  return (STATUS_ALIASES[kind]?.[code] as string | undefined) ?? code;
}

export function getStatusMeta(kind: StatusKind, code: string | null | undefined): StatusMeta {
  const normalized = normalizeStatusCode(kind, code);
  const registry = STATUS_META[kind] as Record<string, StatusMeta>;
  return (
    registry[normalized] ?? {
      code: normalized || 'unknown',
      label: normalized || '未知',
      color: 'default',
      role: 'system',
      actionHint: '查看详情',
    }
  );
}
