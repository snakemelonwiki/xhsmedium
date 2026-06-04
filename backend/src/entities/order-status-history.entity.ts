import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * 订单 9 阶段状态机轨迹。
 *
 * 业务来源：v1.3 任务清单 v1.3-四端口迭代任务清单.md 教务端状态信息板块。
 * 对应 SQL：migrations/M25__academic_end_tables.up.sql §6 + schema.sql §22。
 *
 * 9 阶段枚举（v1 教务流程）：
 * - Submitted    已投稿
 * - WithEditor   编辑手中
 * - UnderReview  审稿中
 * - Revision     返修中
 * - Accepted     录用
 * - Proofing     校稿中
 * - Online       已上线
 * - Indexed      已检索
 * - Rejected     拒稿
 *
 * 业务规则：
 * - 每次进入新阶段写一行 entered_at=left_at=NULL 表示进行中；
 * - 离开阶段时回填 left_at；
 * - expected_at 为该阶段预计产出时间，用于超时提醒（与 order_reminders 联动）。
 * - 与 order_node_remind_log（M22）关系：log 按规则幂等防重发；本表按阶段全量留痕。
 */
@Entity('order_status_history')
@Index('idx_osh_order', ['orderId'])
@Index('idx_osh_order_entered', ['orderId', 'enteredAt'])
@Index('idx_osh_order_left', ['orderId', 'leftAt'])
@Index('idx_osh_stage', ['stage'])
export class OrderStatusHistory {
  /** 主键（UUID 风格 VARCHAR(64)）。 */
  @PrimaryColumn({ length: 64 })
  id: string;

  /** 所属订单 ID，orders.id。 */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  /**
   * 当前阶段。9 阶段枚举之一（Submitted/WithEditor/UnderReview/Revision/Accepted/Proofing/Online/Indexed/Rejected）。
   * 注意：与 orders.current_stage 字段冗余；本表保留历史轨迹，orders.current_stage 仅为最新阶段。
   */
  @Column({ length: 32 })
  stage: string;

  /** 进入该阶段的时间（必填）。 */
  @Column({ name: 'entered_at', type: 'datetime' })
  enteredAt: Date;

  /**
   * 离开该阶段的时间。
   * NULL = 当前进行中阶段（用于快速查询"当前阶段"：WHERE left_at IS NULL）。
   * 非 NULL = 历史阶段。
   */
  @Column({ name: 'left_at', type: 'datetime', nullable: true })
  leftAt: Date | null;

  /**
   * 该阶段预计产出时间。
   * 触发逻辑：entered_at + SLA = expected_at。超时则通过 order_reminders 推送提醒。
   * 注意：SLA 来自业务配置表（v1.3 暂未实现配置表，先 hardcode 在 orders.service.ts）。
   */
  @Column({ name: 'expected_at', type: 'datetime', nullable: true })
  expectedAt: Date | null;

  /** 触发本次状态变更的操作人（教务）ID，users.id。 */
  @Column({ name: 'operator_id', length: 64, nullable: true })
  operatorId: string | null;

  /** 备注（如：客户要求加快、与编辑沟通结果）。 */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
