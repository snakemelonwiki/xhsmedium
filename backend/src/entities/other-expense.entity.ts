import {
  Entity, PrimaryColumn, Column, Index, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 其他支出（公司运营成本）。
 * 默认作为公司级公摊成本；若设了 relatedOrderId，则可选分摊到具体订单的利润计算。
 */
@Entity('other_expenses')
@Index('idx_other_expenses_related_order_id', ['relatedOrderId'])
export class OtherExpense {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'category', type: 'varchar', length: 64 })
  category: string;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'occurred_at', type: 'datetime', nullable: true })
  occurredAt: Date | null;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'attachment_url', type: 'varchar', length: 500, nullable: true })
  attachmentUrl: string | null;

  @Column({ name: 'recorded_by', length: 64, nullable: true })
  recordedBy: string | null;

  @Column({ name: 'related_order_id', length: 64, nullable: true })
  relatedOrderId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
