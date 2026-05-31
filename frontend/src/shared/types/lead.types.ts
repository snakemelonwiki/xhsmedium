/**
 * 客资字段类型定义
 * P0-3: 确定客资字段口径
 *
 * 本文件定义客资(leads)的核心字段类型和接口
 */

/**
 * 客资主状态
 */
export type LeadStatus =
  | 'new'                    // 新客资未分配
  | 'assigned'               // 已分配销售
  | 'in_followup'            // 销售跟进中
  | 'in_collaboration'       // 协同中
  | 'operation_handled'      // 运营已处理
  | 'added_success'          // 已添加通过
  | 'invalid';               // 无效客资

/**
 * 添加状态
 */
export type LeadAddStatus =
  | 'not_added'              // 未添加
  | 'applied'                // 已申请添加
  | 'not_passed'             // 客户未通过
  | 'operation_reminded'     // 运营已提醒
  | 'added';                 // 已添加通过

/**
 * 处理状态
 */
export type LeadProcessStatus =
  | 'not_contacted'          // 未联系
  | 'waiting_pass'           // 待通过
  | 'communicating'          // 沟通中
  | 'quoted'                 // 已报价
  | 'deal_pending'           // 待成交
  | 'deal_done'              // 已成交
  | 'invalid';               // 无效

/**
 * 协同状态
 */
export type CollaborationStatus =
  | 'none'                   // 无协同
  | 'pending'                // 待运营处理
  | 'handling'               // 协同处理中
  | 'handled'                // 已处理
  | 'closed';                // 已关闭

/**
 * 客资核心字段接口
 */
export interface Lead {
  id: number;

  // 关联字段
  operatorId: number;                    // 运营人员ID（录入人）
  salesId: number | null;                // 销售人员ID（分配的销售）
  sourceAccountId: number | null;        // 来源账号ID
  sourcePostId: number | null;           // 来源作品ID

  // 客户信息
  platform: string;                      // 平台：xiaohongshu/douyin/other
  nickname: string;                      // 客户昵称
  contact: string;                       // 联系方式
  region?: string;                       // 地区

  // 状态字段（包含 code 和 label）
  status: LeadStatus;                    // 主状态
  statusLabel?: string;                  // 主状态中文标签
  addStatus: LeadAddStatus;              // 添加状态
  addStatusLabel?: string;               // 添加状态中文标签
  processStatus: LeadProcessStatus;      // 处理状态
  processStatusLabel?: string;           // 处理状态中文标签
  collaborationStatus: CollaborationStatus; // 协同状态
  collaborationStatusLabel?: string;     // 协同状态中文标签

  // 备注和截图
  operatorNote?: string;                 // 运营备注
  demandNote?: string;                   // 需求备注
  captureImages?: string[];              // 引流截图URLs

  // 意向度和跟进
  intentionLevel?: number;               // 意向度 1-5
  nextFollowupTime?: string;             // 下次跟进时间

  // 时间戳
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;                   // 分配时间
  firstFollowupAt?: string;              // 首次跟进时间
  lastFollowupAt?: string;               // 最后跟进时间
}

/**
 * 客资列表查询参数
 */
export interface LeadListQuery {
  page?: number;
  pageSize?: number;

  // 筛选条件
  status?: LeadStatus | LeadStatus[];
  addStatus?: LeadAddStatus | LeadAddStatus[];
  processStatus?: LeadProcessStatus | LeadProcessStatus[];
  collaborationStatus?: CollaborationStatus;

  platform?: string;
  operatorId?: number;
  salesId?: number;

  // 时间范围
  startDate?: string;
  endDate?: string;

  // 搜索
  keyword?: string;                      // 搜索昵称/联系方式
}

/**
 * 客资列表响应
 */
export interface LeadListResponse {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 客资详情响应（包含关联信息）
 */
export interface LeadDetail extends Lead {
  operator?: {
    id: number;
    name: string;
    employeeId?: string;
  };
  sales?: {
    id: number;
    name: string;
    employeeId?: string;
  };
  sourceAccount?: {
    id: number;
    platform: string;
    accountName: string;
  };
  sourcePost?: {
    id: number;
    title: string;
    postUrl: string;
  };
  followRecords?: FollowRecordSummary[];
  collaborationTasks?: CollaborationTaskSummary[];
}

/**
 * 跟进记录（简化版，完整定义见 follow-record.types.ts）
 */
export interface FollowRecordSummary {
  id: number;
  leadId: number;
  userId: number;
  userName: string;
  followType: string;
  content: string;
  intentionLevel?: number;
  processStatus?: LeadProcessStatus;
  nextFollowupTime?: string;
  createdAt: string;
}

/**
 * 协同任务（简化版，完整定义见 collaboration.types.ts）
 */
export interface CollaborationTaskSummary {
  id: number;
  leadId: number;
  requesterId: number;
  handlerId: number;
  type: string;
  reason: string;
  status: string;
  createdAt: string;
  handledAt?: string;
}

/**
 * 创建客资请求
 */
export interface CreateLeadRequest {
  platform: string;
  nickname: string;
  contact: string;
  region?: string;

  sourceAccountId?: number;
  sourcePostId?: number;

  salesId?: number;                      // 可选：创建时直接分配销售

  operatorNote?: string;
  demandNote?: string;
  captureImages?: string[];
}

/**
 * 更新客资状态请求
 */
export interface UpdateLeadStatusRequest {
  addStatus?: LeadAddStatus;
  processStatus?: LeadProcessStatus;
  intentionLevel?: number;
  nextFollowupTime?: string;
  note?: string;                         // 状态变更备注
}

/**
 * 分配销售请求
 */
export interface AssignSalesRequest {
  salesId: number;
  note?: string;
}
