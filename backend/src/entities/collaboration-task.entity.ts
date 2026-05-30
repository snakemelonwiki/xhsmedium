import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type CollaborationTaskType =
  | 'remind_customer'
  | 'supplement_info'
  | 'verify_identity'
  | 'second_touch';

export type CollaborationTaskStatus =
  | 'pending'
  | 'handling'
  | 'handled'
  | 'closed';

@Entity('collaboration_tasks')
@Index('idx_collab_lead', ['leadId'])
@Index('idx_collab_requester', ['requesterId'])
@Index('idx_collab_handler', ['handlerId'])
@Index('idx_collab_status', ['status'])
export class CollaborationTask {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'lead_id', length: 64 })
  leadId: string;

  @Column({ name: 'requester_id', length: 64 })
  requesterId: string;

  @Column({ name: 'handler_id', length: 64, nullable: true })
  handlerId: string | null;

  @Column({
    type: 'enum',
    enum: ['remind_customer', 'supplement_info', 'verify_identity', 'second_touch'],
  })
  type: CollaborationTaskType;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'handling', 'handled', 'closed'],
    default: 'pending',
  })
  status: CollaborationTaskStatus;

  @Column({ name: 'handled_note', type: 'text', nullable: true })
  handledNote: string | null;

  @Column({ name: 'requested_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  requestedAt: Date;

  @Column({ name: 'handled_at', type: 'datetime', nullable: true })
  handledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
