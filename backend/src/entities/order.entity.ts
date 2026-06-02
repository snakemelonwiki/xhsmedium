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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
