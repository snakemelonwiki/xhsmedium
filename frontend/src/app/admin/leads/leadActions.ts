import type { CatalogOption } from '@/shared/api/catalog';
import type { AdminLead } from '@/shared/types/admin';

type LeadActionSource = Pick<AdminLead, 'id' | 'customerName' | 'salesName'>;

/**
 * 构造主管客资改派请求体。
 */
export function buildLeadReassignPayload(salesUser: Pick<CatalogOption, 'id' | 'name'>): Record<string, string> {
  return {
    assignedSalesUserId: salesUser.id,
    assignedSalesUserName: salesUser.name,
    status: 'assigned',
  };
}

/**
 * 构造主管客资提醒请求体。
 */
export function buildLeadReminderPayload(lead: LeadActionSource, note?: string): Record<string, string> {
  const message = note?.trim() || `请及时跟进客资：${lead.customerName || lead.id}`;
  return {
    message,
    reason: message,
    leadId: lead.id,
  };
}
