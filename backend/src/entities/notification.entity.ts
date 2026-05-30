import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('notifications')
@Index('idx_notify_receiver_read_created', ['receiverId', 'readStatus', 'createdAt'])
export class Notification {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'receiver_id', length: 64 })
  receiverId: string;

  @Column({ name: 'sender_id', length: 64, nullable: true })
  senderId: string | null;

  @Column({ name: 'port_type', length: 32 })
  portType: string;

  @Column({ name: 'type_code', length: 64 })
  typeCode: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'related_id', length: 64, nullable: true })
  relatedId: string | null;

  @Column({ name: 'related_type', length: 32, nullable: true })
  relatedType: string | null;

  @Column({ name: 'read_status', type: 'tinyint', default: 0 })
  readStatus: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
