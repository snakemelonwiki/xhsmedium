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

  // v1.3 增量（SUP-1，迁移 M27）：主管手动标记为优秀作品
  // 0 = 普通作品；1 = 被主管手动标记为"优秀作品"（学习榜单主管推荐栏目使用）
  /**
   * 是否被主管手动标记为"优秀作品"。
   * 0 = 普通作品（默认）；1 = 被主管标记，会出现在运营端学习榜单的"主管推荐"板块。
   * 索引 idx_posts_supervisor_picked 加速按此字段过滤。
   */
  @Column({ name: 'is_supervisor_picked', type: 'tinyint', default: 0 })
  isSupervisorPicked: number;

  // 标记人（主管）ID —— users.id；用于"我标记的优秀作品"过滤
  /**
   * 标记人（主管）用户 ID，users.id。用于：
   * 1. 主管端"我标记的优秀作品"过滤；
   * 2. 审计：哪个主管何时标记了这篇作品。
   * 与 supervisor_picked_at 必须同时存在；is_supervisor_picked = 1 时建议非空。
   */
  @Column({ name: 'supervisor_picked_by', length: 64, nullable: true })
  supervisorPickedBy: string | null;

  // 标记时间
  /**
   * 标记时间。运营端学习榜单"主管推荐"板块按此字段倒序展示。
   * 取消标记时该字段保留作为历史（is_supervisor_picked 回退为 0），如需严格清除可由后台脚本处理。
   */
  @Column({ name: 'supervisor_picked_at', type: 'datetime', nullable: true })
  supervisorPickedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
