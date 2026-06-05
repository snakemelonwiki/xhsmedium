import {
  Entity, PrimaryColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

@Entity('favorites')
@Index('idx_fav_user_id', ['userId'])
@Index('idx_fav_user_target', ['userId', 'targetType', 'targetId'], { unique: true })
export class Favorite {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'target_type', length: 32 })
  targetType: string;

  @Column({ name: 'target_id', length: 64 })
  targetId: string;

  // BUG-FAVORITES-MINE 修复 (2026-06-04)：favorites 列表的 listMinePaged
  //   需要 order: { createdAt: 'DESC' },但 entity 之前只声明了类型,缺装饰器,
  //   TypeORM 抛 EntityPropertyNotFoundError: Property "createdAt" was not
  //   found in "Favorite"。
  //   修复：加 @CreateDateColumn 装饰器,TypeORM 自动管理 + 列表按收藏时间倒序
  //   可正常工作。schema.sql §15 已建 created_at 列(默认值 CURRENT_TIMESTAMP),
  //   这里 name:'created_at' 对齐 DB 列名,避免新插入时缺值或时区漂移。
  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
