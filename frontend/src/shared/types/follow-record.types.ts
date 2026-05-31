/**
 * 跟进记录类型定义
 *
 * 定义销售跟进记录的字段和接口
 */

import type { LeadProcessStatus } from './lead.types';

/**
 * 跟进类型
 */
export type FollowRecordType =
  | 'phone_call'           // 电话沟通
  | 'wechat_chat'          // 微信沟通
  | 'meeting'              // 面谈
  | 'email'                // 邮件
  | 'status_update'        // 状态更新
  | 'note';                // 备注

/**
 * 跟进记录完整接口
 */
export interface FollowRecord {
  id: number;
  leadId: number;                        // 关联客资ID
  userId: number;                        // 跟进人ID
  userName: string;                      // 跟进人姓名

  // 跟进信息
  followType: FollowRecordType;          // 跟进类型
  content: string;                       // 跟进内容
  intentionLevel?: number;               // 意向度 1-5
  processStatus?: LeadProcessStatus;     // 处理状态
  nextFollowupTime?: string;             // 下次跟进时间

  // 时间戳
  createdAt: string;
}

/**
 * 创建跟进记录请求
 */
export interface CreateFollowRecordRequest {
  followType: FollowRecordType;
  content: string;
  intentionLevel?: number;
  processStatus?: LeadProcessStatus;
  nextFollowupTime?: string;
}

/**
 * 跟进记录列表查询参数
 */
export interface FollowRecordListQuery {
  page?: number;
  pageSize?: number;

  // 筛选条件
  leadId?: number;                       // 按客资筛选
  userId?: number;                       // 按跟进人筛选
  followType?: FollowRecordType;         // 按跟进类型筛选

  // 时间范围
  startDate?: string;
  endDate?: string;
}

/**
 * 跟进记录列表响应
 */
export interface FollowRecordListResponse {
  items: FollowRecord[];
  total: number;
  page: number;
  pageSize: number;
}
