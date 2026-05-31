import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import { listAdminAccounts } from '@/shared/api/admin';
import { listPosts } from '@/shared/api/content';

type RawRecord = Record<string, unknown>;

export type CatalogOption = {
  id: string;
  name: string;
  employeeId?: string;
  platform?: string;
  parentId?: string;
};

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

/**
 * 读取可分配销售账号候选；当前后端只有 staff 账号列表，前端先使用活跃账号作为候选。
 */
export async function listAssignableSalesUsers(): Promise<CatalogOption[]> {
  const payload = await apiClient.get<unknown>('/users/staff', {
    query: { limit: 200, offset: 0 },
  });
  const paged = normalizePagedResult<RawRecord>(payload);

  return paged.items
    .filter((item) => (text(item.status) ?? 'active') === 'active')
    .map((item) => ({
      id: text(item.id) ?? '',
      name: text(item.employeeName) ?? text(item.name) ?? text(item.username) ?? '未命名账号',
      employeeId: text(item.employeeId),
    }))
    .filter((item) => item.id);
}

/**
 * 读取来源账号候选，供运营客资录入按真实账号绑定来源。
 */
export async function listSourceAccounts(): Promise<CatalogOption[]> {
  const result = await listAdminAccounts({ pageSize: 200 });
  return result.items.map((item) => ({
    id: item.id,
    name: item.accountName,
    employeeId: item.employeeId,
    platform: item.platform,
  }));
}

/**
 * 读取来源作品候选；传入账号后只显示该账号下作品。
 */
export async function listSourcePosts(accountId?: string): Promise<CatalogOption[]> {
  const result = await listPosts({ pageSize: 200, accountId });
  return result.items.map((item) => ({
    id: item.id,
    name: item.title,
    parentId: item.accountId,
    platform: item.platform,
  }));
}
