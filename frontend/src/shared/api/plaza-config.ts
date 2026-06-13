import { apiClient } from './apiClient';

export interface PlazaConfig {
  minLeads: number;
  minTraffic: number;
  marketingMinLeads: number;
  personaMinTraffic: number;
}

const DEFAULT_PLAZA_CONFIG: PlazaConfig = {
  minLeads: 0,
  minTraffic: 0,
  marketingMinLeads: 1,
  personaMinTraffic: 10000,
};

type RawPlazaConfigResponse = {
  config?: Partial<Record<keyof PlazaConfig, unknown>>;
};

export async function getPlazaConfig(): Promise<PlazaConfig> {
  const payload = await apiClient.get<RawPlazaConfigResponse>('/plaza-config');
  return normalizePlazaConfig(payload.config);
}

export async function updatePlazaConfig(config: PlazaConfig): Promise<PlazaConfig> {
  await apiClient.post('/plaza-config', { ...config });
  return normalizePlazaConfig(config);
}

function normalizePlazaConfig(input?: Partial<Record<keyof PlazaConfig, unknown>>): PlazaConfig {
  return {
    minLeads: toNumber(input?.minLeads, DEFAULT_PLAZA_CONFIG.minLeads),
    minTraffic: toNumber(input?.minTraffic, DEFAULT_PLAZA_CONFIG.minTraffic),
    marketingMinLeads: toNumber(input?.marketingMinLeads, DEFAULT_PLAZA_CONFIG.marketingMinLeads),
    personaMinTraffic: toNumber(input?.personaMinTraffic, DEFAULT_PLAZA_CONFIG.personaMinTraffic),
  };
}

function toNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
