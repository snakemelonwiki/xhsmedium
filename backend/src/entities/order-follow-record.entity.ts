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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
