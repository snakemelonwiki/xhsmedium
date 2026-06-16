import type { PageQuery } from '@/shared/types/pagination';

export type OrderScope = 'academic' | 'sales' | 'all' | 'pool' | 'assigned' | 'mine';

export type OrderStatusCode =
  | 'to_receive'
  | 'in_progress'
  | 'awaiting_client_info'
  | 'awaiting_teacher'
  | 'to_deliver'
  | 'completed'
  | 'abnormal';

export type PaidStatusCode = 'unpaid' | 'partial' | 'paid';

export type HandoverStatusCode = 'pending' | 'handed_over' | 'accepted' | 'rejected';

export interface OrderItem {
  id: string;
  orderCode?: string | null;
  leadId?: string;
  salesUserId?: string;
  salesName?: string;
  academicUserId?: string | null;
  academicName?: string;
  serviceType?: string | null;
  amount?: string | null;
  productType?: string | null;
  guaranteeType?: string | null;
  paymentStage?: string | null;
  customerName?: string | null;
  articlePurpose?: string | null;
  salesContact?: string | null;
  paidStatus: PaidStatusCode | string;
  orderStatus: OrderStatusCode | string;
  handoverStatus?: HandoverStatusCode | string;
  // v1.3 / Task 12: 跟进列表新增「稿件进度」「投稿进度」两列所用字段。
  // 稿件进度 = 履约环节，投稿进度 = 期刊与交付状态组合。
  paperProgress?: string | null;
  currentStage?: string | null;
  proofStatus?: string | null;
  onlineStatus?: string | null;
  indexedStatus?: string | null;
  remark?: string | null;
  // 教务端详情扩展字段（后端暂未全部返回，缺失时显示 '-'）
  deliveryRequirement?: string | null;
  materialStatus?: string | null;
  teacher?: string | null;
  salesSummary?: string | null;
  dealStatus?: string | null;
  dealAmount?: string | null;
  clientDegree?: string | null;
  clientMajorResearch?: string | null;
  clientTimeRequirement?: string | null;
  objectionPoint?: string | null;
  followAction?: string | null;
  followActionAt?: string | null;
  requirementNote?: string | null;
  intentionLevel?: string | null;
  nextFollowAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderFollowRecord {
  id: string;
  orderId: string;
  userId?: string;
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | null;
  remindStage?: string | null;
  createdAt?: string;
}

export interface OrderListQuery extends PageQuery {
  scope: OrderScope;
  status?: string;
  handoverStatus?: string;
  abnormal?: boolean;
}

export interface OrderDeliveryOrderFields {
  id?: string;
  orderNumber?: string | null;
  institutionAccepted?: boolean;
  orderStatus?: string | null;
  customerName?: string | null;
  degreeLevel?: string | null;
  majorDirection?: string | null;
  requiredZone?: string | null;
  paperUse?: string | null;
  registrationFormStatus?: string | null;
  infoSentToTeacherAt?: string | null;
  fundInfo?: string | null;
  fundRemark?: string | null;
  academicRemark?: string | null;
  submissionEmail?: string | null;
  submissionEmailPassword?: string | null;
  authorRegistrationUrl?: string | null;
  authorRegistrationName?: string | null;
  backupSubmissionUrl?: string | null;
  backupSubmissionName?: string | null;
  operationMethod?: string | null;
  plagiarismRequirement?: string | null;
  responsibleTeacher?: string | null;
  statusStage?: string | null;
  paperProgress?: string | null;
  assignedTeacher?: string | null;
  assignedTeacherName?: string | null;
  backupTeacher?: string | null;
  backupTeachers?: OrderBackupTeacher[];
  teacherPhone?: string | null;
  teacherWechat?: string | null;
  teacherStability?: string | null;
  innovationReviewStatus?: string | null;
  innovationReviewAt?: string | null;
  firstDraftReviewStatus?: string | null;
  firstDraftReviewAt?: string | null;
  editorReviewStatus?: string | null;
  editorReviewAt?: string | null;
  authorInfoChecked?: string | null;
  authorInfoCheckedAt?: string | null;
  salesContact?: string | null;
  academicOwner?: string | null;
  lastTeacherUpdateAt?: string | null;
  customerComplaint?: string | null;
  needsSupervisor?: string | null;
  emergencyStatus?: string | null;
  supervisorNote?: string | null;
  nextFollowUpAt?: string | null;
  riskLevel?: string | null;
  journalStatus?: string | null;
  submittedExpectedAt?: string | null;
  withEditorExpectedAt?: string | null;
  underReviewExpectedAt?: string | null;
  revisionExpectedAt?: string | null;
  acceptedExpectedAt?: string | null;
  proofingExpectedAt?: string | null;
  onlineExpectedAt?: string | null;
  indexedExpectedAt?: string | null;
  firstWeekCheckAt?: string | null;
  nextJournalCheckAt?: string | null;
  reminderLetterStatus?: string | null;
  revisionStatus?: string | null;
  revisionDueAt?: string | null;
  pageFeeStatus?: string | null;
  proofingStatus?: string | null;
  onlineStatus?: string | null;
  onlineAt?: string | null;
  indexingStatus?: string | null;
  indexingAt?: string | null;
  reviewReportStatus?: string | null;
}

export interface OrderBackupTeacher {
  teacherId?: string | null;
  teacherName?: string | null;
  teacherPhone?: string | null;
  teacherStability?: string | null;
}

export interface OrderDeliveryAuthor {
  id?: string;
  orderId?: string;
  authorOrder?: number;
  name?: string | null;
  email?: string | null;
  degree?: string | null;
  school?: string | null;
  zipCode?: string | null;
  nameEn?: string | null;
}

export interface OrderDeliverySubmission {
  id?: string;
  orderId?: string;
  submissionNo?: number;
  paperTitle?: string | null;
  journalName?: string | null;
  journalUrl?: string | null;
  account?: string | null;
  password?: string | null;
  submitTime?: string | null;
}

export interface OrderDeliveryFinance {
  orderAmount?: string | null;
  customerPaid?: string | null;
  customerPending?: string | null;
  teacherPrice?: string | null;
  teacherPaid?: string | null;
  teacherPending?: string | null;
}

export interface OrderDeliveryDetail {
  order: OrderDeliveryOrderFields;
  authors: OrderDeliveryAuthor[];
  submissions: OrderDeliverySubmission[];
  backupSubmissions?: OrderDeliverySubmission[];
  finance: OrderDeliveryFinance;
}

export type OrderDeliveryPayload = Partial<OrderDeliveryDetail>;

// ─── 订单异常反馈 ──────────────────────────────────────────────────────────

export type AbnormalTypeCode =
  | 'client_uncooperative'
  | 'material_missing'
  | 'teacher_no_response'
  | 'cycle_risk'
  | 'payment_issue'
  | 'other';

export type ExpectedHelperCode = 'sales' | 'supervisor' | 'operation' | 'other';

export type AbnormalFeedbackStatus = 'open' | 'handling' | 'closed';

export interface OrderAbnormalFeedback {
  id: string;
  orderId: string;
  leadId?: string | null;
  reporterUserId: string;
  abnormalType: AbnormalTypeCode | string;
  description?: string | null;
  expectedHelper?: ExpectedHelperCode | string | null;
  status: AbnormalFeedbackStatus | string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  closedBy?: string | null;
  closeNote?: string | null;
}
