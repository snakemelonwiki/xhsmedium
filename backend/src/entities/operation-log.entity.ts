import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('operation_logs')
@Index('idx_oplog_user', ['userId'])
@Index('idx_oplog_target', ['targetType', 'targetId'])
@Index('idx_oplog_action', ['action'])
@Index('idx_oplog_created', ['createdAt'])
export class OperationLog {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ length: 64 })
  action: string;

  @Column({ name: 'target_type', length: 32 })
  targetType: string;

  @Column({ name: 'target_id', length: 64 })
  targetId: string;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
