import {
  Entity, PrimaryColumn, Column, Index, Unique, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 老师分阶段付款记录。
 * 初稿 / 返修 / 录用 三阶段，支持同一订单多个老师（通过 teacherId 区分）。
 */
@Entity('teacher_payments')
@Index('idx_teacher_payments_order_id', ['orderId'])
@Unique('uk_teacher_payments_order_teacher_stage', ['orderId', 'teacherId', 'stageCode'])
export class TeacherPayment {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'teacher_id', length: 64 })
  teacherId: string;

  /** 阶段编码：draft/revision/acceptance */
  @Column({ name: 'stage_code', length: 16 })
  stageCode: string;

  @Column({ name: 'stage_label', length: 32, nullable: true })
  stageLabel: string | null;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ name: 'recorded_by', length: 64, nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
