import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';

type RawRecord = Record<string, unknown>;

export interface TeacherOption {
  id: string;
  name: string;
  phone?: string | null;
  wechat?: string | null;
  specialty?: string | null;
  direction?: string | null;
  stability?: string | null;
  qualityScore?: string | null;
  status?: string | null;
  currentOrders?: number;
  totalOrders?: number;
  remark?: string | null;
}

function text(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapTeacher(raw: RawRecord): TeacherOption {
  return {
    id: text(raw.id) ?? '',
    name: text(raw.name) ?? '',
    phone: text(raw.phone),
    wechat: text(raw.wechat),
    specialty: text(raw.specialty),
    direction: text(raw.direction),
    stability: text(raw.stability),
    qualityScore: text(raw.qualityScore ?? raw.quality_score),
    status: text(raw.status),
    currentOrders: numberValue(raw.currentOrders ?? raw.current_orders),
    totalOrders: numberValue(raw.totalOrders ?? raw.total_orders),
    remark: text(raw.remark),
  };
}

/**
 * 查询稳定老师库列表，用于教务订单分配老师。
 */
export async function listTeachers(query: { keyword?: string; limit?: number; offset?: number } = {}): Promise<TeacherOption[]> {
  const payload = await apiClient.get<unknown>('/teachers', {
    query: {
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
      ...(query.keyword ? { keyword: query.keyword } : {}),
    },
  });
  return normalizePagedResult<RawRecord>(payload).items.map(mapTeacher);
}

/**
 * 查询老师详情。
 */
export async function getTeacher(id: string): Promise<TeacherOption> {
  const payload = await apiClient.get<RawRecord>(`/teachers/${id}`);
  return mapTeacher(payload);
}
