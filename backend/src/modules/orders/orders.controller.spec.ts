import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('creates controller with all required dependencies', () => {
    const ordersService = {} as any;
    const remindersService = {} as any;
    const abnormalFeedbackService = {} as any;
    const operationLogsService = {} as any;
    const controller = new OrdersController(
      ordersService,
      remindersService,
      abnormalFeedbackService,
      operationLogsService,
    );
    expect(controller).toBeDefined();
  });

  it('blocks sales from changing academic assignment', async () => {
    const ordersService = {
      canAccessOrder: jest.fn().mockResolvedValue(true),
      update: jest.fn(),
    } as any;
    const controller = new OrdersController(
      ordersService,
      {} as any,
      {} as any,
      { create: jest.fn() } as any,
    );
    const res = response();

    await controller.update(
      'order-1',
      { academic_user_id: 'academic-1' },
      { session: { userId: 'sales-1', role: 'sales' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(ordersService.update).not.toHaveBeenCalled();
  });
});
