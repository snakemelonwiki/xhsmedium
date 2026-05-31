/**
 * 协同任务常量配置
 * P0-5: 确定协同任务契约
 */

import type {
  CollaborationTaskStatus,
  CollaborationTaskType,
  CollaborationHandleType
} from '../types/collaboration.types';

/**
 * 协同任务状态配置
 */
export const COLLABORATION_TASK_STATUS_CONFIG: Record<
  CollaborationTaskStatus,
  { code: CollaborationTaskStatus; label: string; color: string; description: string }
> = {
  pending: {
    code: 'pending',
    label: '待处理',
    color: 'warning',
    description: '销售已申请，等待运营处理'
  },
  handling: {
    code: 'handling',
    label: '处理中',
    color: 'processing',
    description: '运营正在处理'
  },
  handled: {
    code: 'handled',
    label: '已处理',
    color: 'success',
    description: '运营已处理完成'
  },
  closed: {
    code: 'closed',
    label: '已关闭',
    color: 'default',
    description: '协同任务已关闭'
  }
};

/**
 * 协同任务类型配置
 */
export const COLLABORATION_TASK_TYPE_CONFIG: Record<
  CollaborationTaskType,
  { code: CollaborationTaskType; label: string; icon: string; description: string }
> = {
  remind_customer: {
    code: 'remind_customer',
    label: '提醒客户',
    icon: 'bell',
    description: '请运营提醒客户通过添加申请'
  },
  supplement_info: {
    code: 'supplement_info',
    label: '补充信息',
    icon: 'file-add',
    description: '请运营补充客户来源信息'
  },
  confirm_identity: {
    code: 'confirm_identity',
    label: '确认身份',
    icon: 'user-check',
    description: '请运营确认客户身份信息'
  },
  second_contact: {
    code: 'second_contact',
    label: '二次触达',
    icon: 'redo',
    description: '请运营进行二次触达'
  }
};

/**
 * 运营处理类型配置
 */
export const COLLABORATION_HANDLE_TYPE_CONFIG: Record<
  CollaborationHandleType,
  { code: CollaborationHandleType; label: string; description: string }
> = {
  customer_reminded: {
    code: 'customer_reminded',
    label: '已提醒客户',
    description: '已通过原渠道提醒客户'
  },
  info_supplemented: {
    code: 'info_supplemented',
    label: '已补充信息',
    description: '已补充客户来源信息'
  },
  identity_confirmed: {
    code: 'identity_confirmed',
    label: '已确认身份',
    description: '已确认客户身份信息'
  },
  second_contacted: {
    code: 'second_contacted',
    label: '已二次触达',
    description: '已完成二次触达'
  }
};

/**
 * 获取协同任务状态标签
 */
export function getCollaborationTaskStatusLabel(status: CollaborationTaskStatus): string {
  return COLLABORATION_TASK_STATUS_CONFIG[status]?.label || status;
}

/**
 * 获取协同任务状态颜色
 */
export function getCollaborationTaskStatusColor(status: CollaborationTaskStatus): string {
  return COLLABORATION_TASK_STATUS_CONFIG[status]?.color || 'default';
}

/**
 * 获取协同任务类型标签
 */
export function getCollaborationTaskTypeLabel(type: CollaborationTaskType): string {
  return COLLABORATION_TASK_TYPE_CONFIG[type]?.label || type;
}

/**
 * 获取处理类型标签
 */
export function getCollaborationHandleTypeLabel(type: CollaborationHandleType): string {
  return COLLABORATION_HANDLE_TYPE_CONFIG[type]?.label || type;
}

/**
 * 协同任务状态选项
 */
export const COLLABORATION_TASK_STATUS_OPTIONS = Object.values(COLLABORATION_TASK_STATUS_CONFIG).map(
  config => ({
    value: config.code,
    label: config.label,
    color: config.color
  })
);

/**
 * 协同任务类型选项
 */
export const COLLABORATION_TASK_TYPE_OPTIONS = Object.values(COLLABORATION_TASK_TYPE_CONFIG).map(
  config => ({
    value: config.code,
    label: config.label,
    icon: config.icon
  })
);

/**
 * 处理类型选项
 */
export const COLLABORATION_HANDLE_TYPE_OPTIONS = Object.values(COLLABORATION_HANDLE_TYPE_CONFIG).map(
  config => ({
    value: config.code,
    label: config.label
  })
);
