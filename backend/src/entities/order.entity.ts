import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 订单交接状态机。文档 1.2 完整版：
 * - pending      待交接（销售创建订单初始值，或教务拒收后可重新进入）
 * - handed_over  已交接（销售成交 / 主动交接完成，等待教务接单）
 * - accepted     已接收（教务接单，进入 in_progress 履约阶段）
 * - rejected     已拒收（教务拒收，写 operation_logs 后流程结束）
 */
export const HANDOVER_STATUS_CODES = [
  'pending',
  'handed_over',
  'accepted',
  'rejected',
] as const;

export type HandoverStatusCode = (typeof HANDOVER_STATUS_CODES)[number];

@Entity('orders')
@Index('idx_orders_lead_id', ['leadId'])
@Index('idx_orders_sales_user_id', ['salesUserId'])
@Index('idx_orders_academic_user_id', ['academicUserId'])
@Index('idx_orders_handover_status', ['handoverStatus'])
export class Order {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'lead_id', length: 64, nullable: true })
  leadId: string | null;

  @Column({ name: 'sales_user_id', length: 64, nullable: true })
  salesUserId: string | null;

  @Column({ name: 'academic_user_id', length: 64, nullable: true })
  academicUserId: string | null;

  @Column({ name: 'service_type', length: 64, nullable: true })
  serviceType: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({
    name: 'paid_status',
    type: 'varchar',
    length: 32,
    default: 'unpaid',
  })
  paidStatus: string;

  @Column({
    name: 'order_status',
    type: 'varchar',
    length: 32,
    default: 'to_receive',
  })
  orderStatus: string;

  @Column({
    name: 'handover_status',
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  handoverStatus: HandoverStatusCode;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  // v1.3 增量（CROSS-4，迁移 M26）：订单编号 ORD-YYYYMMDD-XXXXX
  // 唯一索引 uk_orders_order_code 在迁移中建立。
  /**
   * 订单编号，规则 `ORD-YYYYMMDD-XXXXX`：
   * - YYYYMMDD 为 UTC+8 当日日期；
   * - XXXXX 为当日 5 位自增序号（每日从 00001 开始重置）。
   * 生成逻辑：orders.service.ts 的 generateOrderCode() 私有方法，依赖 orders_order_code_seq 序列表 + 行锁保证并发安全。
   * 历史订单允许 NULL（迁移 M26 不回填），uk_orders_order_code 唯一索引对多个 NULL 兼容。
   */
  @Column({ name: 'order_code', length: 32, nullable: true })
  orderCode: string | null;

  @Column({ name: 'product_type', length: 64, nullable: true })
  productType: string | null;

  @Column({ name: 'guarantee_type', length: 64, nullable: true })
  guaranteeType: string | null;

  @Column({ name: 'payment_stage', length: 64, nullable: true })
  paymentStage: string | null;

  /** 分期方案：three=分三笔（定金/中期/尾款） four=分四笔（定金/前期/中期/后期） */
  @Column({ name: 'payment_plan', length: 16, nullable: true })
  paymentPlan: string | null;

  /** 分期明细 JSON：{ plan, stages: [{name,label,amount,paidAt}], currentStageIndex } */
  @Column({ name: 'payment_stage_detail', type: 'text', nullable: true })
  paymentStageDetail: string | null;

  @Column({ name: 'customer_name', length: 128, nullable: true })
  customerName: string | null;

  @Column({ name: 'education_level', length: 32, nullable: true })
  educationLevel: string | null;

  @Column({ length: 128, nullable: true })
  major: string | null;

  @Column({ length: 128, nullable: true })
  area: string | null;

  @Column({ name: 'article_purpose', length: 128, nullable: true })
  articlePurpose: string | null;

  @Column({ name: 'submit_email', length: 128, nullable: true })
  submitEmail: string | null;

  @Column({ name: 'submit_email_password', length: 128, nullable: true })
  submitEmailPassword: string | null;

  @Column({ name: 'fund_info', type: 'text', nullable: true })
  fundInfo: string | null;

  @Column({ name: 'fund_remark', type: 'text', nullable: true })
  fundRemark: string | null;

  @Column({ name: 'registration_status', length: 32, nullable: true })
  registrationStatus: string | null;

  @Column({ name: 'author_registration_url', length: 500, nullable: true })
  authorRegistrationUrl: string | null;

  @Column({ name: 'author_registration_name', length: 255, nullable: true })
  authorRegistrationName: string | null;

  @Column({ name: 'backup_submission_url', length: 500, nullable: true })
  backupSubmissionUrl: string | null;

  @Column({ name: 'backup_submission_name', length: 255, nullable: true })
  backupSubmissionName: string | null;

  @Column({ name: 'operation_method', length: 32, nullable: true })
  operationMethod: string | null;

  @Column({ name: 'handover_to_teacher_at', type: 'datetime', nullable: true })
  handoverToTeacherAt: Date | null;

  @Column({ name: 'checked_duplicate', type: 'tinyint', default: 0 })
  checkedDuplicate: boolean;

  @Column({ name: 'dispatched_teacher_id', length: 64, nullable: true })
  dispatchedTeacherId: string | null;

  @Column({ name: 'teacher_id', length: 64, nullable: true })
  teacherId: string | null;

  @Column({ name: 'teacher_name', length: 128, nullable: true })
  teacherName: string | null;

  @Column({ name: 'backup_teacher', length: 128, nullable: true })
  backupTeacher: string | null;

  @Column({ name: 'backup_teachers', type: 'text', nullable: true })
  backupTeachers: string | null;

  @Column({ name: 'teacher_phone', length: 64, nullable: true })
  teacherPhone: string | null;

  @Column({ name: 'teacher_wechat', length: 64, nullable: true })
  teacherWechat: string | null;

  @Column({ name: 'teacher_stability', length: 16, nullable: true })
  teacherStability: string | null;

  @Column({ name: 'innovation_review_status', length: 16, nullable: true })
  innovationReviewStatus: string | null;

  @Column({ name: 'innovation_review_at', type: 'datetime', nullable: true })
  innovationReviewAt: Date | null;

  @Column({ name: 'draft_review_status', length: 16, nullable: true })
  draftReviewStatus: string | null;

  @Column({ name: 'draft_review_at', type: 'datetime', nullable: true })
  draftReviewAt: Date | null;

  @Column({ name: 'editor_review_status', length: 16, nullable: true })
  editorReviewStatus: string | null;

  @Column({ name: 'editor_review_at', type: 'datetime', nullable: true })
  editorReviewAt: Date | null;

  @Column({ name: 'author_verify_status', length: 16, nullable: true })
  authorVerifyStatus: string | null;

  @Column({ name: 'author_verify_at', type: 'datetime', nullable: true })
  authorVerifyAt: Date | null;

  @Column({ name: 'sales_contact', length: 128, nullable: true })
  salesContact: string | null;

  @Column({ name: 'academic_owner', length: 128, nullable: true })
  academicOwner: string | null;

  @Column({ name: 'last_teacher_update_at', type: 'datetime', nullable: true })
  lastTeacherUpdateAt: Date | null;

  @Column({ name: 'customer_complaint', length: 16, nullable: true })
  customerComplaint: string | null;

  @Column({ name: 'needs_supervisor', length: 16, nullable: true })
  needsSupervisor: string | null;

  @Column({ name: 'emergency_status', length: 32, nullable: true })
  emergencyStatus: string | null;

  @Column({ name: 'supervisor_note', type: 'text', nullable: true })
  supervisorNote: string | null;

  @Column({ name: 'paper_progress', length: 32, nullable: true })
  paperProgress: string | null;

  @Column({ name: 'current_stage', length: 32, nullable: true })
  currentStage: string | null;

  @Column({ name: 'submitted_expected_at', type: 'datetime', nullable: true })
  submittedExpectedAt: Date | null;

  @Column({ name: 'with_editor_expected_at', type: 'datetime', nullable: true })
  withEditorExpectedAt: Date | null;

  @Column({ name: 'under_review_expected_at', type: 'datetime', nullable: true })
  underReviewExpectedAt: Date | null;

  @Column({ name: 'revision_expected_at', type: 'datetime', nullable: true })
  revisionExpectedAt: Date | null;

  @Column({ name: 'accepted_expected_at', type: 'datetime', nullable: true })
  acceptedExpectedAt: Date | null;

  @Column({ name: 'proofing_expected_at', type: 'datetime', nullable: true })
  proofingExpectedAt: Date | null;

  @Column({ name: 'online_expected_at', type: 'datetime', nullable: true })
  onlineExpectedAt: Date | null;

  @Column({ name: 'indexed_expected_at', type: 'datetime', nullable: true })
  indexedExpectedAt: Date | null;

  @Column({ name: 'first_week_check_at', type: 'datetime', nullable: true })
  firstWeekCheckAt: Date | null;

  @Column({ name: 'next_check_at', type: 'datetime', nullable: true })
  nextCheckAt: Date | null;

  @Column({ name: 'urge_letter_status', length: 16, nullable: true })
  urgeLetterStatus: string | null;

  @Column({ name: 'revision_status', length: 16, nullable: true })
  revisionStatus: string | null;

  @Column({ name: 'revision_due_at', type: 'datetime', nullable: true })
  revisionDueAt: Date | null;

  @Column({ name: 'page_fee_status', length: 16, nullable: true })
  pageFeeStatus: string | null;

  @Column({ name: 'proof_status', length: 16, nullable: true })
  proofStatus: string | null;

  @Column({ name: 'online_status', length: 16, nullable: true })
  onlineStatus: string | null;

  @Column({ name: 'online_at', type: 'datetime', nullable: true })
  onlineAt: Date | null;

  @Column({ name: 'indexed_status', length: 16, nullable: true })
  indexedStatus: string | null;

  @Column({ name: 'indexing_at', type: 'datetime', nullable: true })
  indexingAt: Date | null;

  @Column({ name: 'index_review_report', length: 500, nullable: true })
  indexReviewReport: string | null;

  @Column({ name: 'risk_level', length: 16, nullable: true })
  riskLevel: string | null;

  @Column({ name: 'order_stage', length: 64, nullable: true })
  orderStage: string | null;

  @Column({ name: 'institution_accepted', type: 'tinyint', default: 0 })
  institutionAccepted: boolean;

  @Column({ name: 'next_follow_at', type: 'datetime', nullable: true })
  nextFollowAt: Date | null;

  /** 教务备注（A-5 新增）：教务内部备注，不对外展示。 */
  @Column({ name: 'academic_remark', type: 'text', nullable: true })
  academicRemark: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
