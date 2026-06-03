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

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: 'attachment_url', type: 'varchar', length: 512, nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
  attachmentName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
