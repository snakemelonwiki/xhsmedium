import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  it('归一节点提醒时间到 10:00、15:00、18:00 三个固定时段', () => {
    expect(RemindersService.normalizeRemindAt(new Date('2026-06-14T08:30:00'))?.getHours()).toBe(10);
    expect(RemindersService.normalizeRemindAt(new Date('2026-06-14T12:10:00'))?.getHours()).toBe(15);
    expect(RemindersService.normalizeRemindAt(new Date('2026-06-14T16:20:00'))?.getHours()).toBe(18);
    expect(RemindersService.normalizeRemindAt(new Date('2026-06-14T20:00:00'))?.toISOString()).toContain('2026-06-15');
    expect(RemindersService.normalizeRemindAt(null)).toBeNull();
  });

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

  it('不会因为系统已发送通知就从节点提醒列表隐藏', async () => {
    const andWhere = jest.fn().mockReturnThis();
    const followRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere,
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    } as any;
    const service = new RemindersService(
      followRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.listPending('user-1');

    expect(andWhere).not.toHaveBeenCalledWith('fr.reminder_sent_at IS NULL');
  });
  it('节点提醒只查询明天起未来窗口内的提醒', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T09:00:00+08:00'));
    const andWhere = jest.fn().mockReturnThis();
    const followRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere,
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    } as any;
    const service = new RemindersService(
      followRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.listPending('user-1', { mode: 'future', upcomingHours: 168 });

    expect(andWhere).toHaveBeenCalledWith('fr.next_remind_at >= :tomorrowStart', expect.any(Object));
    expect(andWhere).toHaveBeenCalledWith('fr.next_remind_at <= :horizon', expect.any(Object));
    jest.useRealTimers();
  });

  it('今日待提醒查询今天及以前未确认的提醒', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T09:00:00+08:00'));
    const andWhere = jest.fn().mockReturnThis();
    const followRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere,
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    } as any;
    const service = new RemindersService(
      followRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.listPending('user-1', { mode: 'today', limit: 100 });

    expect(andWhere).toHaveBeenCalledWith('fr.next_remind_at < :tomorrowStart', expect.any(Object));
    expect(andWhere).not.toHaveBeenCalledWith(
      '(fr.enable_early_warning = true OR fr.next_remind_at <= :dayHorizon)',
      expect.any(Object),
    );
    jest.useRealTimers();
  });

  it('点击已提醒后清空下次提醒时间以移出当前列表', async () => {
    const followRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'r1',
        orderId: 'o1',
        userId: 'user-1',
        nextRemindAt: new Date('2026-06-14T10:00:00'),
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as any;
    const service = new RemindersService(
      followRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.markHandled('r1', 'user-1');

    expect(followRepo.update).toHaveBeenCalledWith({ id: 'r1' }, { nextRemindAt: null });
  });
});
