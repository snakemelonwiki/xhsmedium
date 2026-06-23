import {
  Entity, PrimaryColumn, Column, Index, Unique, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 订单分阶段付款记录（客户侧）。
 * closeDeal 时自动插入销售成交阶段的一行；其余阶段由财务后续补录。
 * source: sales_close = 自动来自销售成交；finance_manual = 财务手工录入。
 */
@Entity('order_payments')
@Index('idx_order_payments_order_id', ['orderId'])
@Unique('uk_order_payments_order_stage', ['orderId', 'stageCode'])
export class OrderPayment {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  /** 阶段编码：deposit/midterm/final/extra（schema 默认 3 段，数据可扩展为 4 段） */
  @Column({ name: 'stage_code', length: 16 })
  stageCode: string;

  /** 阶段展示名（如"定金""中期""尾款"） */
  @Column({ name: 'stage_label', length: 32, nullable: true })
  stageLabel: string | null;

  @Column({ name: 'stage_index', type: 'int', default: 0 })
  stageIndex: number;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ name: 'source', type: 'varchar', length: 16, default: 'finance_manual' })
  source: string;

  @Column({ name: 'recorded_by', length: 64, nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
