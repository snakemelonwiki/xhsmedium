import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 节点提醒类型。v1.3 教务端提醒规则 10 种。
 * - first_week_check  首周查稿（投稿后第 7 天）
 * - weekly_check      每周查稿（每周一次）
 * - under_review      投稿后一周进入 Under Review 提醒
 * - urge_letter       催稿信（未入 Under Review 时提醒催稿）
 * - revision          返修提醒
 * - page_fee          版面费提醒（录用后）
 * - proof             校稿提醒
 * - online            Online 提醒
 * - indexed           检索提醒
 * - index_report      检索审查报告提醒
 */
export const ORDER_REMINDER_TYPES = [
  'first_week_check',
  'weekly_check',
  'under_review',
  'urge_letter',
  'revision',
  'page_fee',
  'proof',
  'online',
  'indexed',
  'index_report',
] as const;
export type OrderReminderType = (typeof ORDER_REMINDER_TYPES)[number];

/**
 * 提醒状态。
 * - pending     待发送（已生成未到期或到期未发送）
 * - sent        已发送（已推送给接收人）
 * - dismissed   已忽略（教务/主管手动忽略）
 */
export const ORDER_REMINDER_STATUSES = ['pending', 'sent', 'dismissed'] as const;
export type OrderReminderStatus = (typeof ORDER_REMINDER_STATUSES)[number];

/**
 * 订单节点提醒实例表。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端节点提醒 + 状态信息板块。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §7 + schema.sql §23。
 *
 * 与 order_node_remind_log（M22）关系：
 * - log 按规则幂等防重发（同 order_id + rule_code 同一天只发一次）；
 * - 本表按业务实例拆分（每个具体的提醒事件一行），便于追溯每条提醒是否被处理。
 */
@Entity('order_reminders')
@Index('idx_or_order', ['orderId'])
@Index('idx_or_due_status', ['status', 'dueAt'])
@Index('idx_or_type', ['reminderType'])
@Index('idx_or_order_type', ['orderId', 'reminderType'])
@Index('idx_or_receiver_status', ['receiverId', 'status'])
export class OrderReminder {
  /** 主键（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /** 所属订单 ID，orders.id。 */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  /**
   * 提醒类型。10 种枚举之一（ORDER_REMINDER_TYPES）。
   * 与 (order_id) 形成复合索引 idx_or_order_type，便于按订单+类型查找最新提醒。
   */
  @Column({ name: 'reminder_type', length: 32 })
  reminderType: OrderReminderType;

  /**
   * 提醒状态。
   * 调度器（RemindersService）扫描时：WHERE status = 'pending' AND due_at <= NOW()。
   */
  @Column({ length: 16, default: 'pending' })
  status: OrderReminderStatus;

  /**
   * 到期时间。提醒在该时间点之后被调度器扫描并发送。
   * 索引 idx_or_due_status 加速调度器扫描。
   */
  @Column({ name: 'due_at', type: 'datetime' })
  dueAt: Date;

  /**
   * 实际发送时间。NULL = 尚未发送；非 NULL = 调度器已调用通知服务。
   * 发送后由业务层写入，与 notifications 表无强约束（通过 typeCode='order_reminder' 关联）。
   */
  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt: Date | null;

  /**
   * 接收人用户 ID，users.id。NULL = 系统默认推送给负责教务（orders.academic_user_id）。
   * 索引 idx_or_receiver_status 加速按接收人查未处理提醒。
   */
  @Column({ name: 'receiver_id', length: 64, nullable: true })
  receiverId: string | null;

  /**
   * 提醒备注。生成提醒时由调度器写入（如：首周查稿已超时 2 天，请尽快处理）。
   * 发送通知时作为通知 content 字段。
   */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
