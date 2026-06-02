import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 主管建议（supervisor → operation）
 *
 * - 由 admin / supervisor / owner 角色在 A 端主管端创建；
 * - 创建后通过 `notifications.type_code = 'supervisor_suggestion'` 通知目标运营；
 * - 运营可在运营端查看 / 标记已读（前端 P2-A）。
 */
@Entity('supervisor_suggestions')
@Index('idx_sugg_operator', ['operatorId', 'isRead', 'createdAt'])
@Index('idx_sugg_supervisor', ['supervisorId', 'createdAt'])
export class SupervisorSuggestion {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'supervisor_id', length: 64 })
  supervisorId: string;

  @Column({ name: 'operator_id', length: 64 })
  operatorId: string;

  @Column({ name: 'post_id', length: 64, nullable: true })
  postId: string | null;

  @Column({ name: 'account_id', length: 64, nullable: true })
  accountId: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'is_read', type: 'tinyint', default: 0 })
  isRead: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
