import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('returns order stats for academic dashboard', async () => {
    const ordersService = {
      stats: jest.fn().mockResolvedValue({
        total: 3,
        byStatus: { to_receive: 1, in_progress: 1, abnormal: 1 },
        expiringSoon: 2,
      }),
    } as any;
    const controller = new OrdersController(ordersService);
    const res = response();

    await controller.stats(
      { session: { role: 'academic', userId: 'academic-1' } } as any,
      res,
      undefined,
      undefined,
    );

    expect(ordersService.stats).toHaveBeenCalledWith({
      role: 'academic',
      sessionRole: 'academic',
      currentUserId: 'academic-1',
    });
    expect(res.json).toHaveBeenCalledWith({
      total: 3,
      byStatus: { to_receive: 1, in_progress: 1, abnormal: 1 },
      expiringSoon: 2,
    });
  });
});
