import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// 映射 #7 导入记录核心字段；DDL 中 user_name / error_detail / source / deleted / update_time
// 由数据库默认值维护，当前业务路径不写入。
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

  @Column({ length: 32, default: 'processing' })
  status: string;

  @Column({ name: 'error_file_url', length: 500, nullable: true })
  errorFileUrl: string | null;

  @CreateDateColumn({ name: 'create_time' })
  createdAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
