import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  it('列出当前用户即将到期的订单提醒', async () => {
    const followRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ id: 'r1', orderId: 'o1', nextRemindAt: new Date('2026-06-01T10:00:00Z') }]),
      })),
    } as any;
    const service = new RemindersService(
      followRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const items = await service.listPending('user-1', { upcomingHours: 4, limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('r1');
  });
});
