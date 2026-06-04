import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 老师状态机。教务端「稳定老师库」页面用。
 * - idle     空闲（可派单）
 * - working  接单中（有进行中订单）
 * - full     满载（暂停派单）
 * current_orders 实时统计缓存（与 orders.teacher_id 关联的 in_progress 订单数）；
 * 派单时由业务层更新此字段，避免每次列表都 JOIN 聚合。
 */
export const TEACHER_STATUS_CODES = ['idle', 'working', 'full'] as const;
export type TeacherStatusCode = (typeof TEACHER_STATUS_CODES)[number];

/**
 * 老师稳定性。用于订单派单时筛选稳定老师跳过创新点审核（v1 教务流程：稳定老师跳过创新点审核，新老师必须审核）。
 * - stable     稳定（跳过 innovation_review）
 * - new        新老师（必须 innovation_review_status = passed 才能派单）
 * - probation  试合作（介于两者之间，由教务自行判断）
 */
export const TEACHER_STABILITY_CODES = ['stable', 'new', 'probation'] as const;
export type TeacherStabilityCode = (typeof TEACHER_STABILITY_CODES)[number];

/**
 * 稳定老师库：教务端老师档案与派单关系。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端部分。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §3 + schema.sql §19。
 * 关系：与 orders.teacher_id（接单老师）和 orders.dispatched_teacher_id（派单老师）逻辑关联。
 */
@Entity('teachers')
@Index('idx_teachers_status', ['status'])
@Index('idx_teachers_stability', ['stability'])
export class Teacher {
  /** 老师 ID（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /** 老师姓名（必填）。 */
  @Column({ length: 64 })
  name: string;

  /** 联系电话（与 wechat 二选一必填）。 */
  @Column({ length: 64, nullable: true })
  phone: string | null;

  /** 微信（同上二选一必填，但 v1.3 不强制，由业务层校验）。 */
  @Column({ length: 64, nullable: true })
  wechat: string | null;

  /** 专业能力（如：SCI 期刊、EI 会议、CSCD 期刊；多个用顿号分隔）。 */
  @Column({ length: 255, nullable: true })
  specialty: string | null;

  /** 接单方向（如：计算机、医学、材料；与 specialty 区别：specialty 是"能力"，direction 是"愿意接的领域"）。 */
  @Column({ length: 255, nullable: true })
  direction: string | null;

  /**
   * 老师稳定性。决定新订单派单时是否需要走"创新点审核"流程。
   * - stable 稳定老师：跳过创新点审核（v1 教务流程"稳定老师跳过创新点"）
   * - new 新老师：必须 innovation_review_status = passed 才能派单
   * - probation 试合作：由教务自行判断
   */
  @Column({ length: 16, default: 'new' })
  stability: TeacherStabilityCode;

  /** 质量评分（0-10，DECIMAL(3,1)）。教务对接单交付质量的主观打分，作为后续派单参考。 */
  @Column({ name: 'quality_score', type: 'decimal', precision: 3, scale: 1, nullable: true })
  qualityScore: string | null;

  /** 备注（自由文本：合作历史、注意事项、特殊偏好等）。 */
  @Column({ type: 'text', nullable: true })
  remark: string | null;

  /** 接单状态。current_orders 与 total_orders 为缓存字段，派单/交付完成时由业务层同步更新。 */
  @Column({ length: 16, default: 'idle' })
  status: TeacherStatusCode;

  /**
   * 当前接单数（实时缓存）：与 orders 表 teacher_id 关联的进行中订单数。
   * 更新时机：派单时 +1、订单 completed/abnormal/closed 时 -1。
   */
  @Column({ name: 'current_orders', type: 'int', default: 0 })
  currentOrders: number;

  /**
   * 累计接单数（历史统计）：自老师入库以来累计接单数。
   * 更新时机：订单 completed 时 +1（不因 abort 而回退）。
   */
  @Column({ name: 'total_orders', type: 'int', default: 0 })
  totalOrders: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
