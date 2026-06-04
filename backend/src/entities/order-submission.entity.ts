import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 订单投稿信息（一稿一投/两稿两投/三稿三投）。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端订单录入投稿信息板块。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §5 + schema.sql §21。
 *
 * 业务规则：
 * - 操作方式（一稿一投/两稿两投/三稿三投）决定 submission_no 的数量：
 *   - 一稿一投 → submission_no=1
 *   - 两稿两投 → submission_no=1,2
 *   - 三稿三投 → submission_no=1,2,3
 * - 每组独立记录 paper_title / journal_name / journal_url / account / password / submit_time。
 * - 唯一约束 (order_id, submission_no) 保证同一位次只有一行。
 */
@Entity('order_submissions')
@Index('uk_order_submissions_order_no', ['orderId', 'submissionNo'], { unique: true })
@Index('idx_order_submissions_order', ['orderId'])
@Index('idx_order_submissions_submit_time', ['submitTime'])
export class OrderSubmission {
  /** 主键（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /** 所属订单 ID，orders.id。 */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  /**
   * 投稿序号。1/2/3，分别对应一稿一投/两稿两投/三稿三投。
   * 与 (order_id) 组合唯一（uk_order_submissions_order_no）。
   */
  @Column({ name: 'submission_no', type: 'int', default: 1 })
  submissionNo: number;

  /** 论文名称（必填）。后续投稿后此名称应与期刊系统登记一致。 */
  @Column({ name: 'paper_title', length: 255 })
  paperTitle: string;

  /** 投稿期刊名称（如：Nature Communications、软学报）。 */
  @Column({ name: 'journal_name', length: 255, nullable: true })
  journalName: string | null;

  /** 投稿网址（投稿系统登录 URL）。 */
  @Column({ name: 'journal_url', length: 500, nullable: true })
  journalUrl: string | null;

  /** 投稿账号（投稿系统用户名/邮箱）。 */
  @Column({ length: 128, nullable: true })
  account: string | null;

  /** 投稿密码。注意：长度 128 容纳加密串；建议后端存储时使用加密字段（如 encryptColumns）。 */
  @Column({ length: 128, nullable: true })
  password: string | null;

  /**
   * 投稿时间。索引 idx_order_submissions_submit_time 便于按时间排序查稿。
   * 后续查稿/催稿逻辑依赖此字段：投稿后一周进入 under_review 提醒等。
   */
  @Column({ name: 'submit_time', type: 'datetime', nullable: true })
  submitTime: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
