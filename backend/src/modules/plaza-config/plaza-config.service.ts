import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlazaConfig } from '../../entities/plaza-config.entity';

interface PlazaThresholdConfig {
  minLeads: number;
  minTraffic: number;
  marketingMinLeads: number;
  personaMinTraffic: number;
  defaultMinLeads: number;
  defaultMinTraffic: number;
}

const DEFAULT_CONFIG: PlazaThresholdConfig = {
  minLeads: 0,
  minTraffic: 0,
  marketingMinLeads: 1,
  personaMinTraffic: 10000,
  defaultMinLeads: 0,
  defaultMinTraffic: 0,
};

@Injectable()
export class PlazaConfigService {
  constructor(
    @InjectRepository(PlazaConfig)
    private readonly plazaConfigRepository: Repository<PlazaConfig>,
  ) {}

  async getConfig(): Promise<PlazaThresholdConfig> {
    const rows = await this.plazaConfigRepository.find();
    const config: Record<string, string> = {};
    for (const row of rows) {
      if (row.configKey) {
        config[row.configKey] = row.configValue;
      }
    }
    return {
      minLeads: this.parseNumber(config['plaza.minLeads'], DEFAULT_CONFIG.minLeads),
      minTraffic: this.parseNumber(config['plaza.minTraffic'], DEFAULT_CONFIG.minTraffic),
      marketingMinLeads: this.parseNumber(config['plaza.marketingMinLeads'], DEFAULT_CONFIG.marketingMinLeads),
      personaMinTraffic: this.parseNumber(config['plaza.personaMinTraffic'], DEFAULT_CONFIG.personaMinTraffic),
      defaultMinLeads: this.parseNumber(config['plaza.defaultMinLeads'], DEFAULT_CONFIG.defaultMinLeads),
      defaultMinTraffic: this.parseNumber(config['plaza.defaultMinTraffic'], DEFAULT_CONFIG.defaultMinTraffic),
    };
  }

  async saveConfig(config: Partial<PlazaThresholdConfig>): Promise<void> {
    const entries = [
      { key: 'plaza.minLeads', value: String(config.minLeads ?? DEFAULT_CONFIG.minLeads) },
      { key: 'plaza.minTraffic', value: String(config.minTraffic ?? DEFAULT_CONFIG.minTraffic) },
      { key: 'plaza.marketingMinLeads', value: String(config.marketingMinLeads ?? DEFAULT_CONFIG.marketingMinLeads) },
      { key: 'plaza.personaMinTraffic', value: String(config.personaMinTraffic ?? DEFAULT_CONFIG.personaMinTraffic) },
      { key: 'plaza.defaultMinLeads', value: String(config.defaultMinLeads ?? DEFAULT_CONFIG.defaultMinLeads) },
      { key: 'plaza.defaultMinTraffic', value: String(config.defaultMinTraffic ?? DEFAULT_CONFIG.defaultMinTraffic) },
    ];

    for (const entry of entries) {
      const existing = await this.plazaConfigRepository.findOne({ where: { configKey: entry.key } });
      if (existing) {
        await this.plazaConfigRepository.update(existing.id, { configValue: entry.value });
      } else {
        await this.plazaConfigRepository.save({
          id: this.generateId(),
          configKey: entry.key,
          configValue: entry.value,
        });
      }
    }
  }

  private parseNumber(value: string | undefined, defaultValue: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}