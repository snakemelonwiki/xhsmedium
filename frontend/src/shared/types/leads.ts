import type {
  AddStatusCode,
  CollaborationStatusCode,
  LeadStatusCode,
  ProcessStatusCode,
} from '@/shared/constants/status';

export type DealStatusCode = 'not_deal' | 'deal_pending' | 'deal_done' | 'refunded' | 'invalid';
export type IntentionLevelCode = 'high' | 'mid' | 'low' | 'invalid' | 'pending';

export interface LeadSourceSummary {
  platform?: string;
  accountId?: string | number;
  accountName?: string;
  postId?: string | number;
  postTitle?: string;
  postUrl?: string;
  postQualityStatus?: 'normal' | 'excellent' | 'unqualified' | string;
}

export interface LeadOperatorSummary {
  id?: string | number;
  name?: string;
}

export interface LeadSalesSummary {
  id?: string | number;
  name?: string;
}

export interface SalesLead {
  id: string | number;
  customerName: string;
  nickname?: string;
  contact?: string;
  phone?: string;
  wechat?: string;
  source?: LeadSourceSummary;
  operator?: LeadOperatorSummary;
  sales?: LeadSalesSummary;
  assignedAt?: string;
  updatedAt?: string;
  status: LeadStatusCode | string;
  addStatus?: AddStatusCode | string;
  processStatus?: ProcessStatusCode | string;
  collaborationStatus?: CollaborationStatusCode | string;
  latestFollowNote?: string;
  latestFollowAt?: string;
  nextFollowAt?: string;
  note?: string;
  captureImageUrl?: string;
  leadCode?: string;
  addMethod?: string;
  /** IP / 地区（运营端填写） */
  ip?: string;
  /** 需求备注（运营端填写） */
  requirementNote?: string;
  /** 用途（销售跟进/成交交接字段，后端存储在 intention） */
  purpose?: string | null;
  /** 主管备注（运营端填写） */
  supervisorNote?: string;
  // v1.3 / CROSS-1 客资分流
  isDispatched?: boolean;
  // v1.3 / SA-1 + CROSS-2 销售"写跟进"扩展字段
  clientDegree?: string | null;
  clientMajorResearch?: string | null;
  clientTimeRequirement?: string | null;
  objectionPoint?: string | null;
  followAction?: string | null;
  followActionAt?: string | null;
  // v1.3 / SA-3 成交状态/金额
  dealStatus?: DealStatusCode | string | null;
  dealAmount?: string | null;
  // T13: 无效原因（标记无效时填写）
  invalidReason?: string | null;
  // v1.3 意向程度（已在 schema/intention_level）
  intentionLevel?: IntentionLevelCode | string | null;
  /** 来源作品质量状态。不合格作品的客资成单按 50% 入单。 */
  sourcePostQualityStatus?: 'normal' | 'excellent' | 'unqualified' | string;
  /** 客资入单价格倍率。普通/优秀为 1，不合格为 0.5。 */
  leadPriceMultiplier?: number;
}

export type LeadTimelineKind = 'follow' | 'collaboration';

export interface LeadTimelineItem {
  id: string | number;
  kind: LeadTimelineKind;
  title: string;
  content?: string;
  actorName?: string;
  occurredAt: string;
  status?: string;
  type?: string;
  priority?: string;
  extra?: Record<string, unknown>;
}
