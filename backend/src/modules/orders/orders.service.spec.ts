import { OrdersService } from './orders.service';

describe('OrdersService stats', () => {
  it('aggregates order status counts for academic dashboard', async () => {
    const createQb = (rows: any[]) => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn(),
      getRawMany: jest.fn(),
    });

    const baseQb = createQb([]);
    const allQb = createQb([]);
    const statusQb = createQb([]);
    const expiringQb = createQb([]);

    baseQb.clone
      .mockReturnValueOnce(allQb)
      .mockReturnValueOnce(statusQb)
      .mockReturnValueOnce(expiringQb);

    allQb.getCount.mockResolvedValueOnce(4);
    statusQb.getRawMany.mockResolvedValueOnce([
      { k: 'to_receive', n: '2' },
      { k: 'in_progress', n: '1' },
      { k: 'abnormal', n: '1' },
    ]);
    expiringQb.getCount.mockResolvedValueOnce(1);

    const orderRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(baseQb),
    };

    const service = new OrdersService(
      orderRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.stats({
      role: 'academic',
      currentUserId: 'academic-1',
      sessionRole: 'academic',
    });

    expect(result).toEqual({
      total: 4,
      byStatus: { to_receive: 2, in_progress: 1, abnormal: 1 },
      expiringSoon: 1,
    });
    expect(baseQb.andWhere).toHaveBeenCalledWith('o.academic_user_id = :uid', { uid: 'academic-1' });
  });
});
