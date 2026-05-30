import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('import_tasks')
@Index('idx_import_user_id', ['userId'])
@Index('idx_import_status', ['status'])
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

  @Column({ name: 'error_file_url', length: 500, nullable: true })
  errorFileUrl: string | null;

  @Column({ length: 32, default: 'processing' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
