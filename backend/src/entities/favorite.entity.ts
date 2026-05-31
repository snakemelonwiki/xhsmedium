import {
  Entity, PrimaryColumn, Column, Index,
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

  createdAt?: Date;
}
