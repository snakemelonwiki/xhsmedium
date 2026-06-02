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
});
