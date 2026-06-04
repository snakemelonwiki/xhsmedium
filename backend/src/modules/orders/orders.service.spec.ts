import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  it('creates service with required dependencies', () => {
    const orderRepository = {} as any;
    const orderFollowRepository = {} as any;
    const userRepository = {} as any;
    const leadRepository = {} as any;
    const dataSource = {} as any;
    const notificationsService = {} as any;
    const operationLogsService = {} as any;
    const service = new OrdersService(
      orderRepository,
      orderFollowRepository,
      userRepository,
      leadRepository,
      dataSource,
      notificationsService,
      operationLogsService,
    );
    expect(service).toBeDefined();
  });
});
