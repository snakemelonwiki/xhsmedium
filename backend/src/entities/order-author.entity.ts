import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 订单多作者信息。一张订单对应 1..N 位作者，作者位次（author_order）唯一。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端订单录入。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §4 + schema.sql §20。
 * 与 leads.client_degree（销售跟进的客户本身学历）区别：
 * 本表是论文作者信息（投稿用），与销售客户学历语义不同。
 *
 * 设计要点：
 * - 唯一约束 (order_id, author_order) 保证同一位次只有一行；
 * - 后续投稿时按 author_order 升序拼接作者列表。
 */
@Entity('order_authors')
@Index('uk_order_authors_order_seq', ['orderId', 'authorOrder'], { unique: true })
@Index('idx_order_authors_order', ['orderId'])
@Index('idx_order_authors_email', ['email'])
export class OrderAuthor {
  /** 主键（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /** 所属订单 ID，orders.id。 */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  /**
   * 作者位次。1 = 第一作者，2 = 第二作者，N = 第 N 作者。
   * 与 (order_id) 组合唯一（uk_order_authors_order_seq）。
   */
  @Column({ name: 'author_order', type: 'int', default: 1 })
  authorOrder: number;

  /** 作者姓名（中文，必填）。 */
  @Column({ length: 64 })
  name: string;

  /**
   * 作者邮箱。投稿时用于稿件通讯、proof 通知等。
   * 索引 idx_order_authors_email 便于按邮箱反查订单。
   */
  @Column({ length: 128, nullable: true })
  email: string | null;

  /** 作者学历（如：本科/硕士/博士/副教授/教授）。 */
  @Column({ length: 32, nullable: true })
  degree: string | null;

  /** 作者学校/单位。索引 idx_order_authors_school 便于按学校反查订单。 */
  @Column({ length: 128, nullable: true })
  school: string | null;

  /** 邮编（部分期刊投稿要求通讯作者邮编）。 */
  @Column({ name: 'zip_code', length: 16, nullable: true })
  zipCode: string | null;

  /**
   * 英文作者信息（如：Wang Xiao, PhD, Department of Computer Science, Peking University）。
   * 投稿系统通常要求全英文作者信息+单位，长度 255 容纳一段完整描述。
   */
  @Column({ name: 'name_en', length: 255, nullable: true })
  nameEn: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
