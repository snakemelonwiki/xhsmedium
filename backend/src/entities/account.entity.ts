import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id', length: 64 })
  employeeId: string;

  @Column({ length: 32 })
  platform: string;

  @Column({ name: 'profile_url', length: 500, nullable: true })
  profileUrl: string | null;

  @Column({ name: 'account_name', length: 128 })
  accountName: string;

  @Column({ name: 'account_uid', length: 128, nullable: true })
  accountUid: string | null;

  @Column({ length: 255, nullable: true })
  persona: string | null;

  @Column({ length: 255, nullable: true })
  positioning: string | null;

  @Column({ name: 'posting_plan', type: 'text', nullable: true })
  postingPlan: string | null;

  @Column({ length: 32, default: '正常' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
