import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PageQuery, PagedResult } from '@/shared/types/pagination';
import type {
  OrderDeliveryAuthor,
  OrderDeliveryDetail,
  OrderDeliveryFinance,
  OrderDeliveryOrderFields,
  OrderDeliveryPayload,
  OrderDeliverySubmission,
  OrderFollowRecord,
  OrderItem,
  OrderListQuery,
} from '@/shared/types/orders';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function mapOrder(raw: RawRecord): OrderItem {
  return {
    id: text(raw.id) ?? '',
    leadId: text(raw.leadId ?? raw.lead_id),
    salesUserId: text(raw.salesUserId ?? raw.sales_user_id),
    salesName: text(raw.salesName ?? raw.sales_name ?? raw.salesUserName ?? raw.sales_user_name),
    academicUserId: text(raw.academicUserId ?? raw.academic_user_id) ?? null,
    academicName: text(raw.academicName ?? raw.academic_name ?? raw.academicUserName ?? raw.academic_user_name),
    serviceType: text(raw.serviceType ?? raw.service_type) ?? null,
    amount: text(raw.amount) ?? null,
    productType: text(raw.productType ?? raw.product_type) ?? null,
    guaranteeType: text(raw.guaranteeType ?? raw.guarantee_type) ?? null,
    paymentStage: text(raw.paymentStage ?? raw.payment_stage) ?? null,
    customerName: text(raw.customerName ?? raw.customer_name) ?? null,
    articlePurpose: text(raw.articlePurpose ?? raw.article_purpose) ?? null,
    salesContact: text(raw.salesContact ?? raw.sales_contact) ?? null,
    paidStatus: text(raw.paidStatus ?? raw.paid_status) ?? 'unpaid',
    orderStatus: text(raw.orderStatus ?? raw.order_status) ?? 'to_receive',
    handoverStatus: text(raw.handoverStatus ?? raw.handover_status) ?? 'pending',
    orderCode: text(raw.orderCode ?? raw.order_code) ?? null,
    // v1.3 / Task 12: 跟进列表新增「稿件进度」「投稿进度」两列。
    paperProgress: text(raw.paperProgress ?? raw.paper_progress) ?? null,
    currentStage: text(raw.currentStage ?? raw.current_stage) ?? null,
    proofStatus: text(raw.proofStatus ?? raw.proof_status) ?? null,
    onlineStatus: text(raw.onlineStatus ?? raw.online_status) ?? null,
    indexedStatus: text(raw.indexedStatus ?? raw.indexed_status) ?? null,
    remark: text(raw.remark) ?? null,
    deliveryRequirement: text(raw.deliveryRequirement ?? raw.delivery_requirement) ?? null,
    materialStatus: text(raw.materialStatus ?? raw.material_status) ?? null,
    teacher: text(raw.teacher ?? raw.teacher_name) ?? null,
    salesSummary: text(raw.salesSummary ?? raw.sales_summary) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at),
    updatedAt: text(raw.updatedAt ?? raw.updated_at),
  };
}

function mapOrderFollowRecord(raw: RawRecord): OrderFollowRecord {
  return {
    id: text(raw.id) ?? '',
    orderId: text(raw.orderId ?? raw.order_id) ?? '',
    userId: text(raw.userId ?? raw.user_id),
    nodeType: text(raw.nodeType ?? raw.node_type) ?? '跟进记录',
    content: text(raw.content) ?? null,
    nextRemindAt: text(raw.nextRemindAt ?? raw.next_remind_at) ?? null,
    remindStage: text(raw.remindStage ?? raw.remind_stage) ?? null,
    createdAt: text(raw.createdAt ?? raw.created_at),
  };
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeRegistrationFormStatus(value: unknown): string | null {
  const rawValue = text(value);
  if (!rawValue) return null;
  const legacyStatusMap: Record<string, string> = {
    pending: '未索要',
    partial: '已索要',
    collected: '已收到',
    sent_to_teacher: '已传老师',
  };
  return legacyStatusMap[rawValue] ?? rawValue;
}

function normalizeByMap(value: unknown, valueMap: Record<string, string>): string | null {
  const rawValue = text(value);
  if (!rawValue) return null;
  return valueMap[rawValue] ?? rawValue;
}

const DELIVERY_VALUE_MAPS = {
  statusStage: {
    pending: '销售建单',
    pending_accept: '待教务审核',
    to_receive: '待教务审核',
    in_progress: '写作中',
    awaiting_client_info: '待补资料',
    awaiting_teacher: '待分配老师',
    to_deliver: '待投稿',
    completed: '已完成',
    abnormal: '异常处理中',
    closed: '已完成',
  },
  paperProgress: {
    pending: '待分配',
    in_progress: '进行中',
    writing: '进行中',
    to_submit: '待投稿',
    submitted: '已投稿',
    revision: '返修中',
    accepted: '已录用',
  },
  teacherStability: {
    new: '新老师',
    stable: '稳定老师',
    probation: '试合作',
    excellent: '优秀',
    average: '一般',
    poor: '差',
  },
  innovationReviewStatus: {
    none: '未提交',
    pending: '待审核',
    passed: '已通过',
    rejected: '需修改',
    skipped: '稳定老师跳过',
  },
  firstDraftReviewStatus: {
    none: '未提交',
    pending: '待审核',
    passed: '已通过',
    rejected: '需修改',
  },
  editorReviewStatus: {
    none: '未提交',
    pending: '待审查',
    passed: '已通过',
    rejected: '需修改',
  },
  authorInfoChecked: {
    none: '未核对',
    pending: '未核对',
    passed: '已核对无误',
    rejected: '有问题待确认',
  },
  riskLevel: {
    low: '正常',
    mid: '提醒',
    medium: '提醒',
    warning: '预警',
    high: '高风险',
    emergency: '应急',
  },
  customerComplaint: {
    yes: '是',
    no: '否',
    true: '是',
    false: '否',
  },
  needsSupervisor: {
    yes: '是',
    no: '否',
    true: '是',
    false: '否',
  },
  emergencyStatus: {
    none: '正常',
    normal: '正常',
    pending: '待处理',
    handling: '处理中',
    resolved: '已解决',
  },
  reminderLetterStatus: {
    none: '不需要',
    not_sent: '不需要',
    pending: '需提醒老师发送',
    sent: '老师已发送',
  },
  revisionStatus: {
    none: '无返修',
    pending: '待提醒老师',
    handling: '老师返修中',
    submitted: '已提交返修',
  },
  pageFeeStatus: {
    none: '未录用',
    pending: '待提醒客户缴纳',
    reminded: '已提醒客户',
    paid: '客户已缴纳',
    required: '未缴纳',
    unpaid: '未缴纳',
  },
  proofingStatus: {
    none: '未到校稿',
    pending: '待客户确认',
    customer_revision: '客户有修改需求',
    handling: '老师校稿中',
    submitted: '已提交校稿',
  },
  onlineStatus: {
    none: '未online',
    pending: '已online待提醒作者',
    reminded: '已提醒作者',
  },
  indexingStatus: {
    none: '未检索',
    pending: '已检索待开报告',
    reminded: '已提醒开检索报告',
  },
  reviewReportStatus: {
    none: '未开',
    reminded: '已提醒',
    completed: '已完成',
  },
} as const;

function mapDeliveryOrder(raw: RawRecord = {}): OrderDeliveryOrderFields {
  const backupTeacherRows = Array.isArray(raw.backupTeachers)
    ? (raw.backupTeachers as RawRecord[])
    : Array.isArray(raw.backup_teachers)
      ? (raw.backup_teachers as RawRecord[])
      : [];
  return {
    id: text(raw.id),
    orderNumber: text(raw.orderNumber ?? raw.order_number) ?? null,
    institutionAccepted: booleanValue(raw.institutionAccepted ?? raw.institution_accepted),
    orderStatus: text(raw.orderStatus ?? raw.order_status) ?? null,
    customerName: text(raw.customerName ?? raw.customer_name) ?? null,
    degreeLevel: text(raw.degreeLevel ?? raw.degree_level) ?? null,
    majorDirection: text(raw.majorDirection ?? raw.major_direction) ?? null,
    requiredZone: text(raw.requiredZone ?? raw.required_zone) ?? null,
    paperUse: text(raw.paperUse ?? raw.paper_use) ?? null,
    registrationFormStatus: normalizeRegistrationFormStatus(raw.registrationFormStatus ?? raw.registration_form_status),
    infoSentToTeacherAt: text(raw.infoSentToTeacherAt ?? raw.info_sent_to_teacher_at) ?? null,
    fundInfo: text(raw.fundInfo ?? raw.fund_info) ?? null,
    fundRemark: text(raw.fundRemark ?? raw.fund_remark) ?? null,
    academicRemark: text(raw.academicRemark ?? raw.academic_remark) ?? null,
    submissionEmail: text(raw.submissionEmail ?? raw.submission_email) ?? null,
    submissionEmailPassword: text(raw.submissionEmailPassword ?? raw.submission_email_password) ?? null,
    authorRegistrationUrl: text(raw.authorRegistrationUrl ?? raw.author_registration_url) ?? null,
    authorRegistrationName: text(raw.authorRegistrationName ?? raw.author_registration_name) ?? null,
    backupSubmissionUrl: text(raw.backupSubmissionUrl ?? raw.backup_submission_url) ?? null,
    backupSubmissionName: text(raw.backupSubmissionName ?? raw.backup_submission_name) ?? null,
    operationMethod: text(raw.operationMethod ?? raw.operation_method) ?? null,
    plagiarismRequirement: text(raw.plagiarismRequirement ?? raw.plagiarism_requirement) ?? null,
    responsibleTeacher: text(raw.responsibleTeacher ?? raw.responsible_teacher) ?? null,
    statusStage: normalizeByMap(raw.statusStage ?? raw.status_stage, DELIVERY_VALUE_MAPS.statusStage),
    paperProgress: normalizeByMap(raw.paperProgress ?? raw.paper_progress, DELIVERY_VALUE_MAPS.paperProgress),
    assignedTeacher: text(raw.assignedTeacher ?? raw.assigned_teacher) ?? null,
    assignedTeacherName: text(raw.assignedTeacherName ?? raw.assigned_teacher_name) ?? null,
    backupTeacher: text(raw.backupTeacher ?? raw.backup_teacher) ?? null,
    backupTeachers: backupTeacherRows.map((item) => ({
      teacherId: text(item.teacherId ?? item.teacher_id) ?? null,
      teacherName: text(item.teacherName ?? item.teacher_name) ?? null,
      teacherPhone: text(item.teacherPhone ?? item.teacher_phone) ?? null,
      teacherStability: normalizeByMap(item.teacherStability ?? item.teacher_stability, DELIVERY_VALUE_MAPS.teacherStability),
    })),
    teacherPhone: text(raw.teacherPhone ?? raw.teacher_phone) ?? null,
    teacherWechat: text(raw.teacherWechat ?? raw.teacher_wechat) ?? null,
    teacherStability: normalizeByMap(raw.teacherStability ?? raw.teacher_stability, DELIVERY_VALUE_MAPS.teacherStability),
    innovationReviewStatus: normalizeByMap(raw.innovationReviewStatus ?? raw.innovation_review_status, DELIVERY_VALUE_MAPS.innovationReviewStatus),
    innovationReviewAt: text(raw.innovationReviewAt ?? raw.innovation_review_at) ?? null,
    firstDraftReviewStatus: normalizeByMap(raw.firstDraftReviewStatus ?? raw.first_draft_review_status, DELIVERY_VALUE_MAPS.firstDraftReviewStatus),
    firstDraftReviewAt: text(raw.firstDraftReviewAt ?? raw.first_draft_review_at) ?? null,
    editorReviewStatus: normalizeByMap(raw.editorReviewStatus ?? raw.editor_review_status, DELIVERY_VALUE_MAPS.editorReviewStatus),
    editorReviewAt: text(raw.editorReviewAt ?? raw.editor_review_at) ?? null,
    authorInfoChecked: normalizeByMap(raw.authorInfoChecked ?? raw.author_info_checked, DELIVERY_VALUE_MAPS.authorInfoChecked),
    authorInfoCheckedAt: text(raw.authorInfoCheckedAt ?? raw.author_info_checked_at) ?? null,
    salesContact: text(raw.salesContact ?? raw.sales_contact) ?? null,
    academicOwner: text(raw.academicOwner ?? raw.academic_owner) ?? null,
    lastTeacherUpdateAt: text(raw.lastTeacherUpdateAt ?? raw.last_teacher_update_at) ?? null,
    customerComplaint: normalizeByMap(raw.customerComplaint ?? raw.customer_complaint, DELIVERY_VALUE_MAPS.customerComplaint),
    needsSupervisor: normalizeByMap(raw.needsSupervisor ?? raw.needs_supervisor, DELIVERY_VALUE_MAPS.needsSupervisor),
    emergencyStatus: normalizeByMap(raw.emergencyStatus ?? raw.emergency_status, DELIVERY_VALUE_MAPS.emergencyStatus),
    supervisorNote: text(raw.supervisorNote ?? raw.supervisor_note) ?? null,
    nextFollowUpAt: text(raw.nextFollowUpAt ?? raw.next_follow_up_at) ?? null,
    riskLevel: normalizeByMap(raw.riskLevel ?? raw.risk_level, DELIVERY_VALUE_MAPS.riskLevel),
    journalStatus: text(raw.journalStatus ?? raw.journal_status) ?? null,
    submittedExpectedAt: text(raw.submittedExpectedAt ?? raw.submitted_expected_at) ?? null,
    withEditorExpectedAt: text(raw.withEditorExpectedAt ?? raw.with_editor_expected_at) ?? null,
    underReviewExpectedAt: text(raw.underReviewExpectedAt ?? raw.under_review_expected_at) ?? null,
    revisionExpectedAt: text(raw.revisionExpectedAt ?? raw.revision_expected_at) ?? null,
    acceptedExpectedAt: text(raw.acceptedExpectedAt ?? raw.accepted_expected_at) ?? null,
    proofingExpectedAt: text(raw.proofingExpectedAt ?? raw.proofing_expected_at) ?? null,
    onlineExpectedAt: text(raw.onlineExpectedAt ?? raw.online_expected_at) ?? null,
    indexedExpectedAt: text(raw.indexedExpectedAt ?? raw.indexed_expected_at) ?? null,
    firstWeekCheckAt: text(raw.firstWeekCheckAt ?? raw.first_week_check_at) ?? null,
    nextJournalCheckAt: text(raw.nextJournalCheckAt ?? raw.next_journal_check_at) ?? null,
    reminderLetterStatus: normalizeByMap(raw.reminderLetterStatus ?? raw.reminder_letter_status, DELIVERY_VALUE_MAPS.reminderLetterStatus),
    revisionStatus: normalizeByMap(raw.revisionStatus ?? raw.revision_status, DELIVERY_VALUE_MAPS.revisionStatus),
    revisionDueAt: text(raw.revisionDueAt ?? raw.revision_due_at) ?? null,
    pageFeeStatus: normalizeByMap(raw.pageFeeStatus ?? raw.page_fee_status, DELIVERY_VALUE_MAPS.pageFeeStatus),
    proofingStatus: normalizeByMap(raw.proofingStatus ?? raw.proofing_status, DELIVERY_VALUE_MAPS.proofingStatus),
    onlineStatus: normalizeByMap(raw.onlineStatus ?? raw.online_status, DELIVERY_VALUE_MAPS.onlineStatus),
    onlineAt: text(raw.onlineAt ?? raw.online_at) ?? null,
    indexingStatus: normalizeByMap(raw.indexingStatus ?? raw.indexing_status, DELIVERY_VALUE_MAPS.indexingStatus),
    indexingAt: text(raw.indexingAt ?? raw.indexing_at) ?? null,
    reviewReportStatus: normalizeByMap(raw.reviewReportStatus ?? raw.review_report_status, DELIVERY_VALUE_MAPS.reviewReportStatus),
  };
}

function mapDeliveryAuthor(raw: RawRecord): OrderDeliveryAuthor {
  return {
    id: text(raw.id),
    orderId: text(raw.orderId ?? raw.order_id),
    authorOrder: numberValue(raw.authorOrder ?? raw.author_order),
    name: text(raw.name) ?? null,
    email: text(raw.email) ?? null,
    degree: text(raw.degree) ?? null,
    school: text(raw.school) ?? null,
    zipCode: text(raw.zipCode ?? raw.zip_code) ?? null,
    nameEn: text(raw.nameEn ?? raw.name_en) ?? null,
  };
}

function mapDeliverySubmission(raw: RawRecord): OrderDeliverySubmission {
  return {
    id: text(raw.id),
    orderId: text(raw.orderId ?? raw.order_id),
    submissionNo: numberValue(raw.submissionNo ?? raw.submission_no),
    paperTitle: text(raw.paperTitle ?? raw.paper_title) ?? null,
    journalName: text(raw.journalName ?? raw.journal_name) ?? null,
    journalUrl: text(raw.journalUrl ?? raw.journal_url) ?? null,
    account: text(raw.account) ?? null,
    password: text(raw.password) ?? null,
    submitTime: text(raw.submitTime ?? raw.submit_time) ?? null,
  };
}

function mapDeliveryFinance(raw: RawRecord = {}): OrderDeliveryFinance {
  return {
    orderAmount: text(raw.orderAmount ?? raw.order_amount) ?? null,
    customerPaid: text(raw.customerPaid ?? raw.clientPaid ?? raw.customer_paid ?? raw.client_paid) ?? null,
    customerPending: text(raw.customerPending ?? raw.clientPending ?? raw.customer_pending ?? raw.client_pending) ?? null,
    teacherPrice: text(raw.teacherPrice ?? raw.teacher_price) ?? null,
    teacherPaid: text(raw.teacherPaid ?? raw.teacher_paid) ?? null,
    teacherPending: text(raw.teacherPending ?? raw.teacher_pending) ?? null,
  };
}

function withPaging(query: PageQuery): { page: number; pageSize: number; limit: number; offset: number } {
  const pageSize = Number(query.pageSize ?? query.limit ?? 20);
  const page = Number(query.page ?? 1);
  const offset = Number(query.offset ?? (page - 1) * pageSize);
  return { page, pageSize, limit: pageSize, offset };
}

export async function listOrders(query: OrderListQuery): Promise<PagedResult<OrderItem>> {
  const { page, pageSize, limit, offset } = withPaging(query);
  const payload = await apiClient.get<unknown>('/orders', {
    query: { ...query, limit, offset },
  });
  const paged = normalizePagedResult<RawRecord>(payload);

  return {
    ...paged,
    page,
    pageSize,
    items: paged.items.map(mapOrder),
  };
}

export async function getOrderDetail(id: string): Promise<OrderItem> {
  const payload = await apiClient.get<RawRecord>(`/orders/${id}`);
  return mapOrder(payload);
}

export async function listOrderFollowRecords(id: string): Promise<OrderFollowRecord[]> {
  const payload = await apiClient.get<unknown>(`/orders/${id}/follow-records`, {
    query: { limit: 50, offset: 0 },
  });
  return normalizePagedResult<RawRecord>(payload).items.map(mapOrderFollowRecord);
}

export type AcademicCreateOrderPayload = {
  serviceType?: string | null;
  productType?: string | null;
  guaranteeType?: string | null;
  amount?: number | string | null;
  paidStatus?: string | null;
  paymentStage?: string | null;
  clientPaid?: number | string | null;
  customerName?: string | null;
  educationLevel?: string | null;
  major?: string | null;
  area?: string | null;
  articlePurpose?: string | null;
  salesContact?: string | null;
  deliveryRequirement?: string | null;
  remark?: string | null;
};

export async function createAcademicOrder(body: AcademicCreateOrderPayload) {
  return apiClient.post<{ ok: boolean; orderId: string; orderCode: string | null }>(`/academic/orders`, body);
}

export async function updateOrder(id: string, body: Record<string, unknown>) {
  return apiClient.patch(`/orders/${id}`, body);
}

export async function getOrderDelivery(id: string): Promise<OrderDeliveryDetail> {
  const payload = await apiClient.get<RawRecord>(`/orders/${id}/delivery`);
  const authors = Array.isArray(payload.authors) ? (payload.authors as RawRecord[]) : [];
  const submissions = Array.isArray(payload.submissions) ? (payload.submissions as RawRecord[]) : [];
  const backupSubmissions = Array.isArray(payload.backupSubmissions)
    ? (payload.backupSubmissions as RawRecord[])
    : Array.isArray(payload.backup_submissions)
      ? (payload.backup_submissions as RawRecord[])
      : [];
  return {
    order: mapDeliveryOrder((payload.order ?? {}) as RawRecord),
    authors: authors.map(mapDeliveryAuthor),
    submissions: submissions.map(mapDeliverySubmission),
    backupSubmissions: backupSubmissions.map(mapDeliverySubmission),
    finance: mapDeliveryFinance((payload.finance ?? {}) as RawRecord),
  };
}

export async function updateOrderDelivery(id: string, body: OrderDeliveryPayload) {
  return apiClient.patch(`/orders/${id}/delivery`, body);
}

/**
 * 教务端新增一条订单跟进节点。nodeType 必填；含"异常"字样后端会向销售发 ORDER_ABNORMAL 通知。
 */
export async function createOrderFollowRecord(
  id: string,
  body: {
    nodeType: string;
    content?: string;
    nextRemindAt?: string | null;
    remindStage?: string;
    attachmentUrl?: string;
    attachmentName?: string;
  },
) {
  return apiClient.post(`/orders/${id}/follow-records`, body);
}

export async function remindSalesPayment(id: string): Promise<{ ok: true; receiverId: string }> {
  return apiClient.post<{ ok: true; receiverId: string }>(`/orders/${id}/remind-sales-payment`, {});
}

export async function markOrderReminderHandled(id: string): Promise<{ ok: boolean; changed: boolean }> {
  return apiClient.patch<{ ok: boolean; changed: boolean }>(`/orders/reminders/${id}/handled`, {});
}

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

function mapAbnormalFeedback(raw: RawRecord): OrderAbnormalFeedback {
  return {
    id: text(raw.id) ?? '',
    orderId: text(raw.orderId ?? raw.order_id) ?? '',
    leadId: text(raw.leadId ?? raw.lead_id) ?? null,
    reporterUserId: text(raw.reporterUserId ?? raw.reporter_user_id) ?? '',
    abnormalType: text(raw.abnormalType ?? raw.abnormal_type) ?? 'other',
    description: text(raw.description) ?? null,
    expectedHelper: text(raw.expectedHelper ?? raw.expected_helper) ?? null,
    status: text(raw.status) ?? 'open',
    createdAt: text(raw.createdAt ?? raw.created_at),
    updatedAt: text(raw.updatedAt ?? raw.updated_at),
    closedAt: text(raw.closedAt ?? raw.closed_at) ?? null,
    closedBy: text(raw.closedBy ?? raw.closed_by) ?? null,
    closeNote: text(raw.closeNote ?? raw.close_note) ?? null,
  };
}

/**
 * 提交一条订单异常反馈。
 * 后端会在事务内写入反馈、改 orders.orderStatus='abnormal'，并向销售+主管发通知。
 */
export async function createAbnormalFeedback(
  orderId: string,
  body: { abnormalType: AbnormalTypeCode | string; description?: string; expectedHelper?: ExpectedHelperCode | string },
) {
  return apiClient.post<{ ok: true; id: string }>(`/orders/${orderId}/abnormal-feedback`, body);
}

/**
 * 列出订单的全部异常反馈。
 * 返回顺序：按 createdAt 倒序。
 */
export async function listAbnormalFeedbacks(orderId: string): Promise<OrderAbnormalFeedback[]> {
  const payload = await apiClient.get<RawRecord>(`/orders/${orderId}/abnormal-feedback`);
  const items = Array.isArray(payload?.items)
    ? (payload.items as RawRecord[])
    : Array.isArray(payload)
      ? (payload as RawRecord[])
      : [];
  return items.map(mapAbnormalFeedback);
}

/**
 * 关闭（处理完成）一条异常反馈，可附带解决方案备注。
 */
export async function closeAbnormalFeedback(
  orderId: string,
  feedbackId: string,
  body: { closeNote?: string; status?: 'handling' | 'closed' } = {},
) {
  return apiClient.patch<{ ok: true }>(`/orders/${orderId}/abnormal-feedback/${feedbackId}/close`, body);
}

// ─── 订单交接状态机（文档 1.2） ──────────────────────────────────────────

export interface OrderHandoverStatus {
  orderId: string;
  handoverStatus: 'pending' | 'handed_over' | 'accepted' | 'rejected' | string;
  orderStatus: string;
  academicUserId: string | null;
  salesUserId: string;
}

/** 查询订单当前交接状态。 */
export async function getOrderHandover(orderId: string): Promise<OrderHandoverStatus> {
  const payload = await apiClient.get<{ ok: boolean } & OrderHandoverStatus>(`/orders/${orderId}/handover`);
  return {
    orderId: payload.orderId,
    handoverStatus: payload.handoverStatus,
    orderStatus: payload.orderStatus,
    academicUserId: payload.academicUserId ?? null,
    salesUserId: payload.salesUserId,
  };
}

/** 销售主动发起交接（pending → handed_over）。 */
export async function handOverOrder(orderId: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/hand-over`, {});
}

/** 教务接单（→ accepted，orderStatus 推 in_progress）。 */
export async function acceptHandoverOrder(orderId: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/accept`, {});
}

/** 教务拒收（→ rejected，必须传 reason）。 */
export async function rejectHandoverOrder(orderId: string, reason: string) {
  return apiClient.post<{ ok: true }>(`/orders/${orderId}/handover/reject`, { reason });
}

// ─── 教务端首页六宫格汇总 ───────────────────────────────────────────────

export type AcademicHomeSummary = {
  pendingReceive: number;
  inProgress: number;
  waitingMaterial: number;
  waitingTeacher: number;
  nearDue: number;
  abnormal: number;
  targets?: Partial<Record<
    'pendingReceive' | 'inProgress' | 'waitingMaterial' | 'waitingTeacher' | 'nearDue' | 'abnormal',
    { orderId?: string | null; targetModule?: string | null; todoType?: string | null }
  >>;
};

const EMPTY_ACADEMIC_HOME_SUMMARY: AcademicHomeSummary = {
  pendingReceive: 0,
  inProgress: 0,
  waitingMaterial: 0,
  waitingTeacher: 0,
  nearDue: 0,
  abnormal: 0,
  targets: {},
};

function academicNumberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 教务端首页六宫格汇总。后端没有就绪时（v1.2 兼容方案）回退到 0，
 * 避免阻塞前端 UI 渲染。
 */
export async function getAcademicHomeSummary(): Promise<AcademicHomeSummary> {
  const payload = await apiClient
    .get<Partial<AcademicHomeSummary> | null>('/academic/home-summary')
    .catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return EMPTY_ACADEMIC_HOME_SUMMARY;
  }
  return {
    pendingReceive: academicNumberOrZero((payload as AcademicHomeSummary).pendingReceive),
    inProgress: academicNumberOrZero((payload as AcademicHomeSummary).inProgress),
    waitingMaterial: academicNumberOrZero((payload as AcademicHomeSummary).waitingMaterial),
    waitingTeacher: academicNumberOrZero((payload as AcademicHomeSummary).waitingTeacher),
    nearDue: academicNumberOrZero((payload as AcademicHomeSummary).nearDue),
    abnormal: academicNumberOrZero((payload as AcademicHomeSummary).abnormal),
    targets: (payload as AcademicHomeSummary).targets ?? {},
  };
}
