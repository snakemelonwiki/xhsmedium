/**
 * 通知类型常量配置
 * P0-6: 确定通知类型和跳转
 */

import type { NotificationType } from '../types/notification.types';

/**
 * 通知类型配置
 */
export const NOTIFICATION_TYPE_CONFIG: Record<
  NotificationType,
  {
    code: NotificationType;
    label: string;
    icon: string;
    color: string;
    description: string;
    targetRoles: ('operation' | 'sales' | 'admin' | 'owner')[];
  }
> = {
  lead_assigned: {
    code: 'lead_assigned',
    label: '新客资分配',
    icon: 'user-add',
    color: 'blue',
    description: '运营分配了新客资给您',
    targetRoles: ['sales']
  },
  collaboration_requested: {
    code: 'collaboration_requested',
    label: '协同申请',
    icon: 'team',
    color: 'warning',
    description: '销售申请了运营协同',
    targetRoles: ['operation']
  },
  collaboration_handled: {
    code: 'collaboration_handled',
    label: '协同已处理',
    icon: 'check-circle',
    color: 'success',
    description: '运营已处理协同任务',
    targetRoles: ['sales']
  },
  customer_not_passed: {
    code: 'customer_not_passed',
    label: '客户未通过',
    icon: 'close-circle',
    color: 'error',
    description: '客户未通过添加申请',
    targetRoles: ['operation']
  },
  customer_added: {
    code: 'customer_added',
    label: '客户已添加',
    icon: 'check',
    color: 'success',
    description: '销售已成功添加客户',
    targetRoles: ['operation']
  },
  lead_status_changed: {
    code: 'lead_status_changed',
    label: '客资状态变更',
    icon: 'sync',
    color: 'cyan',
    description: '客资状态发生变更',
    targetRoles: ['operation', 'sales']
  },
  followup_reminder: {
    code: 'followup_reminder',
    label: '跟进提醒',
    icon: 'clock-circle',
    color: 'orange',
    description: '到达预定跟进时间',
    targetRoles: ['sales']
  }
};

/**
 * 获取通知类型标签
 */
export function getNotificationTypeLabel(type: NotificationType): string {
  return NOTIFICATION_TYPE_CONFIG[type]?.label || type;
}

/**
 * 获取通知类型图标
 */
export function getNotificationTypeIcon(type: NotificationType): string {
  return NOTIFICATION_TYPE_CONFIG[type]?.icon || 'bell';
}

/**
 * 获取通知类型颜色
 */
export function getNotificationTypeColor(type: NotificationType): string {
  return NOTIFICATION_TYPE_CONFIG[type]?.color || 'default';
}

/**
 * 检查角色是否应接收该类型通知
 */
export function shouldReceiveNotification(
  type: NotificationType,
  role: 'operation' | 'sales' | 'admin' | 'owner'
): boolean {
  const config = NOTIFICATION_TYPE_CONFIG[type];
  return config?.targetRoles.includes(role) || role === 'admin' || role === 'owner';
}

/**
 * 通知类型选项
 */
export const NOTIFICATION_TYPE_OPTIONS = Object.values(NOTIFICATION_TYPE_CONFIG).map(config => ({
  value: config.code,
  label: config.label,
  icon: config.icon,
  color: config.color
}));

/**
 * 根据通知类型生成跳转路由
 */
export function getNotificationRoute(
  type: NotificationType,
  targetType: string,
  targetId: string | number,
  role: 'operation' | 'sales' | 'admin' | 'owner'
): string {
  const baseRoutes = {
    operation: '/operation',
    sales: '/sales',
    admin: '/admin',
    owner: '/admin'
  };

  const base = baseRoutes[role];

  switch (type) {
    case 'lead_assigned':
      return `${base}/leads/${targetId}`;

    case 'collaboration_requested':
      if (targetType === 'collaboration_task') {
        return `${base}/collaboration?taskId=${targetId}`;
      }
      return `${base}/collaboration`;

    case 'collaboration_handled':
      if (targetType === 'lead') {
        return `${base}/leads/${targetId}`;
      }
      return `${base}/leads`;

    case 'customer_not_passed':
    case 'customer_added':
    case 'lead_status_changed':
      return `${base}/leads/${targetId}`;

    case 'followup_reminder':
      return `${base}/followups`;

    default:
      return base;
  }
}
