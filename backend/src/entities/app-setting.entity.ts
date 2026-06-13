import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ name: 'setting_key', type: 'varchar', length: 128 })
  settingKey: string;

  @Column({ name: 'setting_value', type: 'text' })
  settingValue: string;

  @Column({ name: 'updated_by', type: 'varchar', length: 64, nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date | null;
}
