import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('orders')
@Index('idx_orders_lead_id', ['leadId'])
@Index('idx_orders_sales_user_id', ['salesUserId'])
@Index('idx_orders_academic_user_id', ['academicUserId'])
export class Order {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'lead_id', length: 64 })
  leadId: string;

  @Column({ name: 'sales_user_id', length: 64 })
  salesUserId: string;

  @Column({ name: 'academic_user_id', length: 64, nullable: true })
  academicUserId: string | null;

  @Column({ name: 'service_type', length: 64, nullable: true })
  serviceType: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({
    name: 'paid_status',
    type: 'enum',
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
  })
  paidStatus: 'unpaid' | 'partial' | 'paid';

  @Column({
    name: 'order_status',
    type: 'enum',
    enum: [
      'to_receive',
      'in_progress',
      'awaiting_client_info',
      'awaiting_teacher',
      'to_deliver',
      'completed',
      'abnormal',
    ],
    default: 'to_receive',
  })
  orderStatus:
    | 'to_receive'
    | 'in_progress'
    | 'awaiting_client_info'
    | 'awaiting_teacher'
    | 'to_deliver'
    | 'completed'
    | 'abnormal';

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
