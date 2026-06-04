import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * 订单财务扩展（订单额/已付/待付 + 老师接单价/已付/待付）。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端财务信息板块。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §8 + schema.sql §24。
 *
 * 业务规则：
 * - 1:1 关系（UNIQUE order_id），便于单独权限管理（财务字段敏感，可能需要脱敏导出）；
 * - orders.amount 仍保留冗余（订单额），order_finance 做更详细的财务拆分；
 * - 客户侧 3 字段：订单额 / 已付 / 待付；
 * - 老师侧 3 字段：接单价 / 已付 / 待付；
 * - 已付 + 待付 = 总额（冗余校验入口）；与 paid_status 字段联动。
 */
@Entity('order_finance')
export class OrderFinance {
  /** 主键（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /**
   * 所属订单 ID，orders.id。1:1 关系（UNIQUE）。
   * 销售在「我的成交」（SA-8）提交成交信息时同步创建。
   */
  @Column({ name: 'order_id', length: 64, unique: true })
  orderId: string;

  /**
   * 订单额（与 orders.amount 冗余，便于财务独立查询）。
   * 精度 DECIMAL(12,2) 容纳 999,999,999,999.99。
   */
  @Column({ name: 'order_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  orderAmount: string | null;

  /** 客户已付金额。 */
  @Column({ name: 'client_paid', type: 'decimal', precision: 12, scale: 2, nullable: true })
  clientPaid: string | null;

  /** 客户待付金额（= 订单额 - 已付）。 */
  @Column({ name: 'client_pending', type: 'decimal', precision: 12, scale: 2, nullable: true })
  clientPending: string | null;

  /** 老师接单价格（教务与老师约定的合作价格）。 */
  @Column({ name: 'teacher_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  teacherPrice: string | null;

  /** 已付给老师的金额。 */
  @Column({ name: 'teacher_paid', type: 'decimal', precision: 12, scale: 2, nullable: true })
  teacherPaid: string | null;

  /** 待付给老师的金额（= 接单价 - 已付）。 */
  @Column({ name: 'teacher_pending', type: 'decimal', precision: 12, scale: 2, nullable: true })
  teacherPending: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
