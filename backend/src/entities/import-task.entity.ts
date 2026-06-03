import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * import_tasks 表 (M23 扩展)：
 * 异步导入任务，payload_json 存原始数据，result_json 存处理结果。
 */
@Entity('import_tasks')
@Index('idx_import_user_id', ['userId'])
export class ImportTask {
  @PrimaryColumn({ length: 64 })
  id: string;

  @Column({ name: 'import_type', length: 32 })
  importType: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'total_count', type: 'int', default: 0 })
  totalCount: number;

  @Column({ name: 'success_count', type: 'int', default: 0 })
  successCount: number;

  @Column({ name: 'fail_count', type: 'int', default: 0 })
  failCount: number;

  @Column({ length: 32, default: 'pending' })
  status: string;

  @Column({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson: Record<string, any> | null;

  @Column({ name: 'result_json', type: 'json', nullable: true })
  resultJson: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'error_file_url', length: 500, nullable: true })
  errorFileUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
