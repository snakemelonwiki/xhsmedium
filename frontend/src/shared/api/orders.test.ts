import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrderDetail, listOrderFollowRecords, listOrders, updateOrder } from './orders';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('@/shared/api/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/apiClient')>('@/shared/api/apiClient');
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

describe('orders api', () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
    apiClientMock.patch.mockReset();
  });

  it('normalizes list response fields and sends offset paging', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      items: [
        {
          id: 101,
          lead_id: 201,
          sales_user_id: 'sales-1',
          academic_user_id: 'academic-1',
          service_type: '论文辅导',
          paid_status: 'paid',
          order_status: 'in_progress',
        },
      ],
      total: 1,
      limit: 20,
      offset: 20,
    });

    const result = await listOrders({ scope: 'sales', page: 2, pageSize: 20 });

    expect(apiClientMock.get).toHaveBeenCalledWith('/orders', {
      query: { scope: 'sales', page: 2, pageSize: 20, limit: 20, offset: 20 },
    });
    expect(result.items[0]).toMatchObject({
      id: '101',
      leadId: '201',
      salesUserId: 'sales-1',
      academicUserId: 'academic-1',
      serviceType: '论文辅导',
      paidStatus: 'paid',
      orderStatus: 'in_progress',
    });
  });

  it('gets an order detail from the real detail endpoint', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      id: 'order-1',
      lead_id: 'lead-1',
      sales_user_id: 'sales-1',
      academic_user_id: null,
      service_type: '文书服务',
      amount: '3999.00',
      paid_status: 'partial',
      order_status: 'to_receive',
      remark: '尽快处理',
      created_at: '2026-05-01T00:00:00.000Z',
    });

    const result = await getOrderDetail('order-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/orders/order-1');
    expect(result).toMatchObject({
      id: 'order-1',
      leadId: 'lead-1',
      academicUserId: null,
      serviceType: '文书服务',
      amount: '3999.00',
      paidStatus: 'partial',
      orderStatus: 'to_receive',
      remark: '尽快处理',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
  });

  it('lists order follow records as timeline items', async () => {
    apiClientMock.get.mockResolvedValueOnce({
      items: [
        {
          id: 'record-1',
          order_id: 'order-1',
          user_id: 'academic-1',
          node_type: '待客户资料',
          content: '已提醒客户补资料',
          next_remind_at: '2026-05-03T00:00:00.000Z',
          created_at: '2026-05-02T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const result = await listOrderFollowRecords('order-1');

    expect(apiClientMock.get).toHaveBeenCalledWith('/orders/order-1/follow-records', {
      query: { limit: 50, offset: 0 },
    });
    expect(result).toEqual([
      {
        id: 'record-1',
        orderId: 'order-1',
        userId: 'academic-1',
        nodeType: '待客户资料',
        content: '已提醒客户补资料',
        nextRemindAt: '2026-05-03T00:00:00.000Z',
        createdAt: '2026-05-02T00:00:00.000Z',
      },
    ]);
  });

  it('patches an order with the supplied body', async () => {
    apiClientMock.patch.mockResolvedValueOnce({ ok: true });

    await updateOrder('order-1', { academic_user_id: 'academic-1' });

    expect(apiClientMock.patch).toHaveBeenCalledWith('/orders/order-1', { academic_user_id: 'academic-1' });
  });
});
