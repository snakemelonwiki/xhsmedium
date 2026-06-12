import type { SalesLead } from '@/shared/types/leads';

/**
 * 构造销售端提醒运营的收件人。
 */
export function buildOperationReminderTarget(lead: SalesLead): {
  recipientId: string;
  recipientName?: string;
} {
  return {
    recipientId: lead.operator?.id ? String(lead.operator.id) : '',
    recipientName: lead.operator?.name,
  };
}
