import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('post_metrics_history')
@Index('idx_history_post_id', ['postId'])
@Index('idx_history_created_at', ['createdAt'])
export class PostMetricsHistory {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'post_id', length: 64 })
  postId: string;

  @Column({ type: 'bigint', default: 0 })
  likes: number;

  @Column({ type: 'bigint', default: 0 })
  comments: number;

  @Column({ type: 'bigint', default: 0 })
  favorites: number;

  @Column({ type: 'bigint', default: 0 })
  shares: number;

  @Column({ name: 'leads_count', type: 'bigint', default: 0 })
  leadsCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
