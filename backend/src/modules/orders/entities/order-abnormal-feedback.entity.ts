import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 订单异常反馈表。
 * 用于替换原有"节点类型含异常"字符串匹配的脆弱方案；
 * 教务端独立提交一条异常反馈，关联到 order_id，
 * 创建时驱动 orders.orderStatus = 'abnormal'，关闭后回退。
 */
@Entity('order_abnormal_feedbacks')
@Index('idx_oaf_order_id', ['orderId'])
@Index('idx_oaf_status', ['status'])
@Index('idx_oaf_reporter', ['reporterUserId'])
export class OrderAbnormalFeedback {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'lead_id', length: 64, nullable: true })
  leadId: string | null;

  @Column({ name: 'reporter_user_id', length: 64 })
  reporterUserId: string;

  @Column({ name: 'abnormal_type', length: 32 })
  abnormalType:
    | 'client_uncooperative'
    | 'material_missing'
    | 'teacher_no_response'
    | 'cycle_risk'
    | 'payment_issue'
    | 'other';

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'expected_helper', length: 32, nullable: true })
  expectedHelper: 'sales' | 'supervisor' | 'operation' | 'other' | null;

  @Column({ length: 16, default: 'open' })
  status: 'open' | 'handling' | 'closed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by', length: 64, nullable: true })
  closedBy: string | null;

  @Column({ name: 'close_note', type: 'text', nullable: true })
  closeNote: string | null;
}
