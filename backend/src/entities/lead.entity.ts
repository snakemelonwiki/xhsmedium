import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', length: 64 })
  employeeId: string;

  @Column({ name: 'account_id', length: 64 })
  accountId: string;

  @Column({ name: 'post_id', length: 64, nullable: true })
  postId: string | null;

  @Column({ length: 32 })
  platform: string;

  @Column({ name: 'contact_info', length: 255 })
  contactInfo: string;

  @Column({ length: 128, nullable: true })
  nickname: string | null;

  @Column({ length: 64, nullable: true })
  budget: string | null;

  @Column({ name: 'major_content', length: 255, nullable: true })
  majorContent: string | null;

  @Column({ length: 128, nullable: true })
  ip: string | null;

  @Column({ length: 32, default: 'new' })
  status: string;

  @Column({ name: 'deal_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dealAmount: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'capture_image_url', length: 500, nullable: true })
  captureImageUrl: string | null;

  @Column({ name: 'sales_feedback', type: 'text', nullable: true })
  salesFeedback: string | null;

  @Column({ name: 'sales_updated_at', type: 'datetime', nullable: true })
  salesUpdatedAt: Date | null;

  @Column({ name: 'sales_user_name', length: 64, nullable: true })
  salesUserName: string | null;

  @Column({ name: 'assigned_sales_user_id', length: 64, nullable: true })
  assignedSalesUserId: string | null;

  @Column({ name: 'assigned_sales_user_name', length: 64, nullable: true })
  assignedSalesUserName: string | null;

  @Column({ name: 'process_status', length: 32, default: 'not_contacted' })
  processStatus: string;

  @Column({ name: 'add_status', length: 32, default: 'not_added' })
  addStatus: string;

  @Column({ length: 32, nullable: true })
  intention: string | null;

  @Column({ name: 'lead_code', length: 32, nullable: true })
  leadCode: string | null;

  @Column({ name: 'intention_level', length: 16, default: 'pending' })
  intentionLevel: string;

  @Column({ name: 'add_method', length: 16, default: 'unknown' })
  addMethod: string;

  @Column({ name: 'next_follow_time', type: 'datetime', nullable: true })
  nextFollowTime: Date | null;

  @Column({ name: 'matched_post_id', length: 64, nullable: true })
  matchedPostId: string | null;

  @Column({ name: 'source_unknown', type: 'tinyint', default: 0 })
  sourceUnknown: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
