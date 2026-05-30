import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * exports 表 (M3 迁移)：异步导出任务。
 * §12 Excel 导出 + §11.2 异步生成 + §11 通知 export_done。
 */
@Entity('exports')
@Index('idx_exports_user', ['userId'])
@Index('idx_exports_status', ['status'])
@Index('idx_exports_created_at', ['createdAt'])
export class ExportTask {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'export_type', length: 32 })
  exportType: string;

  @Column({ name: 'filter_json', type: 'text', nullable: true })
  filterJson: string | null;

  @Column({ name: 'file_url', length: 500, nullable: true })
  fileUrl: string | null;

  @Column({ length: 32, default: 'pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
