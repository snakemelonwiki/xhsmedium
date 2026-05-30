import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('lead_follow_records')
@Index('idx_follow_lead_id', ['leadId'])
@Index('idx_follow_user_id', ['userId'])
export class LeadFollowRecord {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'lead_id', length: 64 })
  leadId: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'follow_type', length: 32, default: '微信' })
  followType: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'next_follow_time', type: 'datetime', nullable: true })
  nextFollowTime: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
