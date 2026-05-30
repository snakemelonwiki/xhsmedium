import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('lead_drafts')
@Index('idx_drafts_user_id', ['userId'])
@Index('idx_drafts_user_type_updated', ['userId', 'draftType', 'updatedAt'])
export class LeadDraft {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'draft_type', length: 32 })
  draftType: string;

  @Column({ name: 'content_json', type: 'text' })
  contentJson: string;

  @Column({ name: 'image_urls', type: 'json', nullable: true })
  imageUrls: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
