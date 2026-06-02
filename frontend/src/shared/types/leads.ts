import type {
  AddStatusCode,
  CollaborationStatusCode,
  LeadStatusCode,
  ProcessStatusCode,
} from '@/shared/constants/status';

export interface LeadSourceSummary {
  platform?: string;
  accountId?: string | number;
  accountName?: string;
  postId?: string | number;
  postTitle?: string;
  postUrl?: string;
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
  /** 主管备注（运营端填写） */
  supervisorNote?: string;
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
