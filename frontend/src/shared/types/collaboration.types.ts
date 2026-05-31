/**
 * 协同任务类型定义
 * P0-5: 确定协同任务契约
 *
 * 定义创建协同、运营处理协同、协同记录查询的字段和状态
 */

/**
 * 协同任务状态
 */
export type CollaborationTaskStatus =
  | 'pending'                // 待处理
  | 'handling'               // 处理中
  | 'handled'                // 已处理
  | 'closed';                // 已关闭

/**
 * 协同任务类型
 */
export type CollaborationTaskType =
  | 'remind_customer'        // 提醒客户
  | 'supplement_info'        // 补充来源信息
  | 'confirm_identity'       // 确认客户身份
  | 'second_contact';        // 二次触达

/**
 * 运营处理类型
 */
export type CollaborationHandleType =
  | 'customer_reminded'      // 已提醒客户
  | 'info_supplemented'      // 已补充信息
  | 'identity_confirmed'     // 已确认身份
  | 'second_contacted';      // 已二次触达

/**
 * 协同任务完整接口
 */
export interface CollaborationTask {
  id: number;
  leadId: number;                        // 关联客资ID

  // 关联人员
  requesterId: number;                   // 申请人ID（销售）
  handlerId: number;                     // 处理人ID（运营）

  // 任务信息
  type: CollaborationTaskType;           // 协同类型
  reason: string;                        // 协同原因
  status: CollaborationTaskStatus;       // 任务状态

  // 处理信息
  handleType?: CollaborationHandleType;  // 处理类型
  handleNote?: string;                   // 处理备注
  handleResult?: string;                 // 处理结果

  // 时间戳
  createdAt: string;
  handledAt?: string;
  cancelledAt?: string;
}

/**
 * 协同任务详情（包含关联信息）
 */
export interface CollaborationTaskDetail extends CollaborationTask {
  requester: {
    id: number;
    name: string;
    employeeId?: string;
  };
  handler: {
    id: number;
    name: string;
    employeeId?: string;
  };
  lead: {
    id: number;
    nickname: string;
    contact: string;
    platform: string;
    status: string;
    addStatus: string;
  };
}

/**
 * 协同任务紧急程度
 */
export type CollaborationUrgency = 'low' | 'medium' | 'high';

/**
 * 创建协同任务请求
 * 注意：leadId 通过 URL 参数传递 (POST /api/leads/:id/collaboration)
 * 此接口仅用于请求体字段
 */
export interface CreateCollaborationRequest {
  type: CollaborationTaskType;
  reason: string;                        // 协同原因（必填）
  urgency?: CollaborationUrgency;        // 紧急程度（可选）
}

/**
 * 处理协同任务请求
 */
export interface HandleCollaborationRequest {
  handleType: CollaborationHandleType;
  handleNote?: string;                   // 处理备注
  handleResult?: string;                 // 处理结果描述

  // 可选：同时更新客资状态
  updateLeadAddStatus?: string;          // 更新客资添加状态
  updateLeadNote?: string;               // 更新客资备注
}

/**
 * 协同任务列表查询参数
 */
export interface CollaborationTaskListQuery {
  page?: number;
  pageSize?: number;

  // 筛选条件
  status?: CollaborationTaskStatus | CollaborationTaskStatus[];
  type?: CollaborationTaskType | CollaborationTaskType[];

  requesterId?: number;                  // 按申请人筛选
  handlerId?: number;                    // 按处理人筛选
  leadId?: number;                       // 按客资筛选

  // 时间范围
  startDate?: string;
  endDate?: string;

  // 搜索
  keyword?: string;                      // 搜索客户昵称/联系方式
}

/**
 * 协同任务列表响应
 */
export interface CollaborationTaskListResponse {
  items: CollaborationTaskDetail[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 协同任务统计
 */
export interface CollaborationTaskStats {
  total: number;
  pending: number;
  handling: number;
  handled: number;
  closed: number;

  // 按类型统计
  byType: Record<CollaborationTaskType, number>;

  // 平均处理时长（小时）
  avgHandleTime?: number;
}
