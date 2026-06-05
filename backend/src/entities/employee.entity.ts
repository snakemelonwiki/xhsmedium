import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_code', length: 32, unique: true })
  employeeCode: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 64, nullable: true })
  phone: string | null;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  @Column({ length: 32, default: '在职' })
  status: string;

  /**
   * 部门名称（v1.4 主管端-员工管理）。
   * 简单字符串存储，不单独建部门表（按用户要求）。
   * 历史数据允许为空。
   */
  @Column({ length: 64, nullable: true, comment: '部门名称（简单字符串，不另建部门表）' })
  department: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
