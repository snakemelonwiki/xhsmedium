import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * post_metrics - 作品指标按天聚合表
 *
 * 表结构来源：migrations/M17__post_metrics_table.up.sql
 * 用途：学习榜单 / 流量榜 / 近期爆款基表
 * - 按作品 + 日期维度聚合指标（点赞/评论/收藏/分享/流量）
 * - 采集任务按天 upsert（UNIQUE INDEX 确保不重复）
 * - idx_metrics_date(date) 单独索引支撑"今日榜单"单日查询
 */
@Entity('post_metrics')
@Index('idx_metrics_date', ['date'])
export class PostMetrics {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'post_id', length: 64 })
  postId: string;

  @Column({ type: 'date' })
  date: Date;

  /** 指标采集时间（精确到秒），与 date 同一天但记录实际刷新时刻 */
  @Column({ name: 'collected_at', type: 'datetime' })
  collectedAt: Date;

  @Column({ type: 'bigint', default: 0 })
  likes: number;

  @Column({ type: 'bigint', default: 0 })
  comments: number;

  @Column({ type: 'bigint', default: 0 })
  favorites: number;

  @Column({ type: 'bigint', default: 0 })
  shares: number;

  /** 来源流量（仅获客贴 / 营销贴计入） */
  @Column({ type: 'bigint', default: 0 })
  traffic: number;

  /** 浏览数（可选） */
  @Column({ type: 'bigint', default: 0 })
  views: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
