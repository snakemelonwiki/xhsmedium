/**
 * 通知类型定义
 * P0-6: 确定通知类型和跳转
 *
 * 定义通知类型枚举和跳转规则
 */

/**
 * 通知类型
 */
export type NotificationType =
  | 'lead_assigned'              // 新客资分配
  | 'collaboration_requested'    // 协同申请
  | 'collaboration_handled'      // 协同已处理
  | 'customer_not_passed'        // 客户未通过
  | 'customer_added'             // 客户已添加
  | 'lead_status_changed'        // 客资状态变更
  | 'followup_reminder';         // 跟进提醒

/**
 * 通知目标类型
 */
export type NotificationTargetType =
  | 'lead'                       // 客资
  | 'collaboration_task'         // 协同任务
  | 'follow_record'              // 跟进记录
  | 'post'                       // 作品
  | 'account';                   // 账号

/**
 * 通知接口
 */
export interface Notification {
  id: number;
  userId: number;                        // 接收人ID

  // 通知内容
  type: NotificationType;                // 通知类型
  title: string;                         // 通知标题
  content: string;                       // 通知内容

  // 跳转信息
  targetType: NotificationTargetType;    // 目标类型
  targetId: string | number;             // 目标ID
  routeHint: string;                     // 路由提示（前端跳转路径）

  // 状态
  isRead: boolean;                       // 是否已读
  readAt?: string;                       // 阅读时间

  // 时间戳
  createdAt: string;
}

/**
 * 通知列表查询参数
 */
export interface NotificationListQuery {
  page?: number;
  pageSize?: number;

  // 筛选条件
  type?: NotificationType | NotificationType[];
  isRead?: boolean;                      // 只看未读/已读

  // 时间范围
  startDate?: string;
  endDate?: string;
}

/**
 * 通知列表响应
 */
export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unreadCount: number;                   // 未读数量
  page: number;
  pageSize: number;
}

/**
 * 创建通知请求（后端使用）
 */
export interface CreateNotificationRequest {
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  targetType: NotificationTargetType;
  targetId: string | number;
  routeHint: string;
}

/**
 * 标记已读请求
 */
export interface MarkNotificationReadRequest {
  notificationIds: number[];             // 要标记的通知ID列表
}

/**
 * 未读数量响应
 */
export interface UnreadCountResponse {
  total: number;
  byType: Partial<Record<NotificationType, number>>;
}

/**
 * 通知设置
 */
export interface NotificationSettings {
  userId: number;
  enabledTypes: NotificationType[];      // 启用的通知类型
  emailNotification: boolean;            // 是否邮件通知
  soundNotification: boolean;            // 是否声音提醒
}
