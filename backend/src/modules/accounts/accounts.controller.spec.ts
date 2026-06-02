import { AccountsController } from './accounts.controller';

describe('AccountsController A端契约补齐', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;
  const operationLogs = () => ({
    log: jest.fn().mockResolvedValue(undefined),
  }) as any;

  it('staff 分页查询账号时只传递自己的 employeeId 过滤', async () => {
    const accountsService = {
      findAllPaged: jest.fn().mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 }),
    } as any;
    const controller = new AccountsController(accountsService, operationLogs());
    const res = response();

    await controller.findAll(
      { session: { role: 'staff', employeeId: 'emp-1' } } as any,
      res,
      '10',
      '0',
      '',
    );

    expect(accountsService.findAllPaged).toHaveBeenCalledWith(10, 0, '', '', 'emp-1');
    expect(res.json).toHaveBeenCalledWith({ items: [], total: 0, limit: 10, offset: 0 });
  });

  it('staff 非分页查询账号时只传递自己的 employeeId 过滤', async () => {
    const accountsService = {
      findAll: jest.fn().mockResolvedValue([]),
    } as any;
    const controller = new AccountsController(accountsService, operationLogs());
    const res = response();

    await controller.findAll(
      { session: { role: 'operation', employeeId: 'emp-2' } } as any,
      res,
      undefined,
      undefined,
      '小红书',
    );

    expect(accountsService.findAll).toHaveBeenCalledWith('小红书', '', 'emp-2');
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('拒绝 staff 越权修改他人账号', async () => {
    const accountsService = {
      findById: jest.fn().mockResolvedValue({ id: 'account-1', employeeId: 'emp-owner' }),
      update: jest.fn(),
    } as any;
    const controller = new AccountsController(accountsService, operationLogs());
    const res = response();

    await controller.patch(
      'account-1',
      { accountName: '越权账号' },
      { session: { role: 'staff', employeeId: 'emp-other' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(accountsService.update).not.toHaveBeenCalled();
  });

  it('PATCH /accounts/:id/status 调用 service 更新账号状态', async () => {
    const accountsService = {
      findById: jest.fn().mockResolvedValue({ id: 'account-1', employeeId: 'emp-1' }),
      updateStatus: jest.fn(),
    } as any;
    const controller = new AccountsController(accountsService, operationLogs());
    const res = response();

    await controller.updateStatus(
      'account-1',
      { status: '停用' },
      { session: { role: 'staff', employeeId: 'emp-1' } } as any,
      res,
    );

    expect(accountsService.updateStatus).toHaveBeenCalledWith('account-1', '停用');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
