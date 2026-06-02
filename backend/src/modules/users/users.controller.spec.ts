import { UsersController } from './users.controller';

describe('UsersController A端账号候选契约', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('允许已登录运营读取 active sales 候选用于客资分配', async () => {
    const usersService = {
      findAssignableSalesUsersPaged: jest.fn().mockResolvedValue({
        items: [{ id: 'sales-1', username: 'sales1', role: 'sales', status: 'active' }],
        total: 1,
        limit: 200,
        offset: 0,
      }),
    } as any;
    const controller = new UsersController(usersService, { log: jest.fn() } as any);
    const res = response();

    await controller.findAll(
      { session: { role: 'staff', userId: 'staff-1' } } as any,
      res,
      '200',
      '0',
      'sales',
    );

    expect(usersService.findAssignableSalesUsersPaged).toHaveBeenCalledWith({ limit: 200, offset: 0 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
  });

  it('非主管账号不能读取完整用户列表', async () => {
    const usersService = {
      findAll: jest.fn(),
      findAllPaged: jest.fn(),
    } as any;
    const controller = new UsersController(usersService, { log: jest.fn() } as any);
    const res = response();

    await controller.findAll(
      { session: { role: 'staff', userId: 'staff-1' } } as any,
      res,
      '20',
      '0',
      undefined,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(usersService.findAll).not.toHaveBeenCalled();
    expect(usersService.findAllPaged).not.toHaveBeenCalled();
  });
});
