import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', length: 64 })
  employeeId: string;

  @Column({ name: 'account_id', length: 64 })
  accountId: string;

  @Column({ length: 32 })
  platform: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  copywriting: string | null;

  @Column({ name: 'cover_image_url', length: 500, nullable: true })
  coverImageUrl: string | null;

  @Column({ name: 'cover_thumb_url', length: 500, nullable: true })
  coverThumbUrl: string | null;

  @Column({ name: 'post_url', length: 500, nullable: true })
  postUrl: string | null;

  @Column({ name: 'post_type', length: 32 })
  postType: string;

  @Column({ type: 'bigint', default: 0 })
  traffic: number;

  @Column({ type: 'bigint', default: 0 })
  likes: number;

  @Column({ type: 'bigint', default: 0 })
  comments: number;

  @Column({ type: 'bigint', default: 0 })
  favorites: number;

  @Column({ type: 'bigint', default: 0 })
  shares: number;

  @Column({ name: 'metrics_updated_at', type: 'datetime', nullable: true })
  metricsUpdatedAt: Date | null;

  @Column({ name: 'published_at', type: 'date' })
  publishedAt: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'supervisor_suggestion', type: 'text', nullable: true })
  supervisorSuggestion: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
