import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('post_metrics_history')
export class PostMetricsHistory {
  @PrimaryGeneratedColumn('uuid')
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

  @Column({ name: 'captured_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  capturedAt: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime: Date;
}
