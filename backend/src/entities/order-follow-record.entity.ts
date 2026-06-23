import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('order_follow_records')
@Index('idx_order_follow_order_id', ['orderId'])
@Index('idx_order_follow_user_id', ['userId'])
export class OrderFollowRecord {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'node_type', length: 32 })
  nodeType: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'next_remind_at', type: 'datetime', nullable: true })
  nextRemindAt: Date | null;

  @Column({ name: 'remind_stage', type: 'varchar', length: 32, nullable: true })
  remindStage: string | null;

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  /**
   * 提前7天预警发送时间（独立于 reminder_sent_at 的到期通知）。
   * 非空表示已发过预警，避免重复发送。
   */
  @Column({ name: 'early_warning_sent_at', type: 'datetime', nullable: true })
  earlyWarningSentAt: Date | null;

  /**
   * 是否启用提前7天预警。
   * true 时 runEarlyWarning() 会在 next_remind_at 前7天发 ORDER_NODE_EARLY_WARNING 通知；
   * false（默认）则只走 runOnce() 的到期提醒。
   */
  @Column({ name: 'enable_early_warning', type: 'boolean', default: false })
  enableEarlyWarning: boolean;

  @Column({ name: 'attachment_url', type: 'varchar', length: 512, nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
