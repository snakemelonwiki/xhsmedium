import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('supervisor_suggestions')
@Index('idx_ss_employee_id', ['employeeId'])
@Index('idx_ss_target', ['targetType', 'targetId'])
@Index('idx_ss_receiver', ['receiverId', 'readStatus'])
export class SupervisorSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 发送者（主管）用户ID */
  @Column({ name: 'sender_id', length: 64 })
  senderId: string;

  /** 接收者（运营）用户ID */
  @Column({ name: 'receiver_id', length: 64 })
  receiverId: string;

  /** 关联员工ID（方便查询该员工的所有建议） */
  @Column({ name: 'employee_id', length: 64, nullable: true })
  employeeId: string | null;

  /**
   * 建议对象类型：
   * - post     作品
   * - account  账号
   * - employee 员工
   */
  @Column({ name: 'target_type', length: 32 })
  targetType: string;

  /** 建议对象ID */
  @Column({ name: 'target_id', length: 64 })
  targetId: string;

  /** 建议内容 */
  @Column({ type: 'text' })
  content: string;

  /**
   * 已读状态：
   * - 0  未读
   * - 1  已读
   */
  @Column({ name: 'read_status', type: 'tinyint', default: 0 })
  readStatus: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
