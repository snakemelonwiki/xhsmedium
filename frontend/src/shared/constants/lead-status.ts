/**
 * 客资状态枚举常量
 * P0-4: 确定客资状态枚举
 *
 * 定义客资各状态的code、中文label、颜色、可操作角色、下一步动作
 */

import type { LeadStatus, LeadAddStatus, LeadProcessStatus, CollaborationStatus } from '../types/lead.types';

/**
 * 状态配置接口
 */
interface StatusConfig<T extends string> {
  code: T;
  label: string;
  color: string;                         // Ant Design Tag颜色
  description: string;
  allowedRoles: ('operation' | 'sales' | 'admin' | 'owner')[];
  nextActions?: string[];                // 可执行的下一步动作
}

/**
 * 客资主状态配置
 */
export const LEAD_STATUS_CONFIG: Record<LeadStatus, StatusConfig<LeadStatus>> = {
  new: {
    code: 'new',
    label: '新客资',
    color: 'blue',
    description: '新录入的客资，尚未分配销售',
    allowedRoles: ['operation', 'admin', 'owner'],
    nextActions: ['分配销售', '标记无效']
  },
  assigned: {
    code: 'assigned',
    label: '已分配',
    color: 'cyan',
    description: '已分配给销售，等待销售跟进',
    allowedRoles: ['operation', 'sales', 'admin', 'owner'],
    nextActions: ['开始跟进', '申请添加', '标记无效']
  },
  in_followup: {
    code: 'in_followup',
    label: '跟进中',
    color: 'processing',
    description: '销售正在跟进中',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['更新状态', '申请协同', '标记已添加', '标记无效']
  },
  in_collaboration: {
    code: 'in_collaboration',
    label: '协同中',
    color: 'warning',
    description: '销售已申请运营协同，等待运营处理',
    allowedRoles: ['operation', 'sales', 'admin', 'owner'],
    nextActions: ['运营处理', '查看进度']
  },
  operation_handled: {
    code: 'operation_handled',
    label: '运营已处理',
    color: 'purple',
    description: '运营已处理协同任务，等待销售继续跟进',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['继续跟进', '标记已添加', '再次协同']
  },
  added_success: {
    code: 'added_success',
    label: '已添加',
    color: 'success',
    description: '客户已成功添加',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['继续跟进', '更新处理状态']
  },
  invalid: {
    code: 'invalid',
    label: '无效',
    color: 'default',
    description: '无效客资',
    allowedRoles: ['operation', 'sales', 'admin', 'owner'],
    nextActions: []
  }
};

/**
 * 添加状态配置
 */
export const ADD_STATUS_CONFIG: Record<LeadAddStatus, StatusConfig<LeadAddStatus>> = {
  not_added: {
    code: 'not_added',
    label: '未添加',
    color: 'default',
    description: '尚未申请添加客户',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['申请添加']
  },
  applied: {
    code: 'applied',
    label: '已申请添加',
    color: 'processing',
    description: '销售已申请添加，等待客户通过',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['标记未通过', '标记已通过', '申请协同']
  },
  not_passed: {
    code: 'not_passed',
    label: '客户未通过',
    color: 'error',
    description: '客户未通过添加申请',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['申请运营协同', '标记无效']
  },
  operation_reminded: {
    code: 'operation_reminded',
    label: '运营已提醒',
    color: 'warning',
    description: '运营已提醒客户或补充信息',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['再次申请添加', '标记已通过']
  },
  added: {
    code: 'added',
    label: '已添加',
    color: 'success',
    description: '客户已成功添加',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['继续跟进']
  }
};

/**
 * 处理状态配置
 */
export const PROCESS_STATUS_CONFIG: Record<LeadProcessStatus, StatusConfig<LeadProcessStatus>> = {
  not_contacted: {
    code: 'not_contacted',
    label: '未联系',
    color: 'default',
    description: '尚未联系客户',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['开始联系']
  },
  waiting_pass: {
    code: 'waiting_pass',
    label: '待通过',
    color: 'processing',
    description: '等待客户通过添加',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['标记已通过', '标记未通过']
  },
  communicating: {
    code: 'communicating',
    label: '沟通中',
    color: 'cyan',
    description: '正在与客户沟通',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['更新意向度', '进入报价']
  },
  quoted: {
    code: 'quoted',
    label: '已报价',
    color: 'purple',
    description: '已向客户报价',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['等待成交', '继续沟通']
  },
  deal_pending: {
    code: 'deal_pending',
    label: '待成交',
    color: 'warning',
    description: '客户有意向，等待成交',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['标记已成交', '继续跟进']
  },
  deal_done: {
    code: 'deal_done',
    label: '已成交',
    color: 'success',
    description: '客户已成交',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['创建订单', '后续服务']
  },
  invalid: {
    code: 'invalid',
    label: '无效',
    color: 'default',
    description: '无效客户',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: []
  }
};

/**
 * 协同状态配置
 */
export const COLLABORATION_STATUS_CONFIG: Record<CollaborationStatus, StatusConfig<CollaborationStatus>> = {
  none: {
    code: 'none',
    label: '无协同',
    color: 'default',
    description: '未发起协同',
    allowedRoles: ['operation', 'sales', 'admin', 'owner'],
    nextActions: ['发起协同']
  },
  requested: {
    code: 'requested',
    label: '已申请',
    color: 'processing',
    description: '销售已申请协同，等待运营处理',
    allowedRoles: ['operation', 'sales', 'admin', 'owner'],
    nextActions: ['运营处理']
  },
  in_progress: {
    code: 'in_progress',
    label: '处理中',
    color: 'warning',
    description: '运营正在处理协同任务',
    allowedRoles: ['operation', 'admin', 'owner'],
    nextActions: ['完成处理']
  },
  handled: {
    code: 'handled',
    label: '已处理',
    color: 'success',
    description: '运营已处理完成',
    allowedRoles: ['sales', 'admin', 'owner'],
    nextActions: ['继续跟进', '再次协同']
  }
};

/**
 * 获取状态标签文本
 */
export function getStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_CONFIG[status]?.label || status;
}

export function getAddStatusLabel(status: LeadAddStatus): string {
  return ADD_STATUS_CONFIG[status]?.label || status;
}

export function getProcessStatusLabel(status: LeadProcessStatus): string {
  return PROCESS_STATUS_CONFIG[status]?.label || status;
}

export function getCollaborationStatusLabel(status: CollaborationStatus): string {
  return COLLABORATION_STATUS_CONFIG[status]?.label || status;
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status: LeadStatus): string {
  return LEAD_STATUS_CONFIG[status]?.color || 'default';
}

export function getAddStatusColor(status: LeadAddStatus): string {
  return ADD_STATUS_CONFIG[status]?.color || 'default';
}

export function getProcessStatusColor(status: LeadProcessStatus): string {
  return PROCESS_STATUS_CONFIG[status]?.color || 'default';
}

export function getCollaborationStatusColor(status: CollaborationStatus): string {
  return COLLABORATION_STATUS_CONFIG[status]?.color || 'default';
}

/**
 * 检查角色是否可操作该状态
 */
export function canOperateStatus(
  status: LeadStatus,
  role: 'operation' | 'sales' | 'admin' | 'owner'
): boolean {
  return LEAD_STATUS_CONFIG[status]?.allowedRoles.includes(role) || false;
}

/**
 * 状态选项（用于筛选器）
 */
export const LEAD_STATUS_OPTIONS = Object.values(LEAD_STATUS_CONFIG).map(config => ({
  value: config.code,
  label: config.label,
  color: config.color
}));

export const ADD_STATUS_OPTIONS = Object.values(ADD_STATUS_CONFIG).map(config => ({
  value: config.code,
  label: config.label,
  color: config.color
}));

export const PROCESS_STATUS_OPTIONS = Object.values(PROCESS_STATUS_CONFIG).map(config => ({
  value: config.code,
  label: config.label,
  color: config.color
}));

export const COLLABORATION_STATUS_OPTIONS = Object.values(COLLABORATION_STATUS_CONFIG).map(config => ({
  value: config.code,
  label: config.label,
  color: config.color
}));
