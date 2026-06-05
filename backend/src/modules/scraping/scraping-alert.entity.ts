import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 抓取告警表（owner 专属可见）
 *
 * v1.4（2026-06-05）：全局抓取锁 + 失败告警入库。
 * 触发场景（event_code 取值）：
 *   - streak_3   连续失败 3 次（最严重，应立即人工介入）
 *   - total_10   累计失败 10 次
 *   - total_30   累计失败 30 次
 *   - total_50   累计失败 50 次
 *   - total_100  累计失败 100 次
 *
 * 注意：列名 `event_code` 避开 MySQL 保留字 `trigger`。
 */
@Entity('scraping_alerts')
@Index('idx_sa_created', ['createdAt'])
@Index('idx_sa_level_created', ['level', 'createdAt'])
@Index('idx_sa_resolved_created', ['resolved', 'createdAt'])
export class ScrapingAlert {
  @PrimaryColumn({ length: 64 })
  id: string;

  /** info / warn / error */
  @Column({ length: 32 })
  level: string;

  /** 小红书 / 抖音 / null（platform_unsupported 时为 null） */
  @Column({ length: 32, nullable: true })
  platform: string | null;

  /** fetch-metrics / refresh-metrics / parse-link / parser（兜底） */
  @Column({ length: 64 })
  source: string;

  /** streak_3 / total_10 / total_30 / total_50 / total_100 */
  @Column({ name: 'event_code', length: 64 })
  eventCode: string;

  @Column({ name: 'post_id', length: 64, nullable: true })
  postId: string | null;

  @Column({ name: 'post_url', type: 'text', nullable: true })
  postUrl: string | null;

  @Column({ name: 'error_code', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'fail_streak', type: 'int', default: 0 })
  failStreak: number;

  @Column({ name: 'total_failed', type: 'int', default: 0 })
  totalFailed: number;

  /** JSON.stringify 的额外上下文（retry/timeout/retryable...） */
  @Column({ type: 'text', nullable: true })
  context: string | null;

  /** 0 未处理 / 1 已处理 */
  @Column({ type: 'tinyint', default: 0 })
  resolved: number;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', length: 64, nullable: true })
  resolvedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
