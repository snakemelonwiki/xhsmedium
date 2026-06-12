import { EmployeesController } from './employees.controller';

describe('EmployeesController A端契约补齐', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('PATCH /employees/:id/status 离职时调用 service 软删除员工', async () => {
    const employeesService = {
      findById: jest.fn().mockResolvedValue({ id: 'emp-1', status: '在职' }),
      softDelete: jest.fn(),
    } as any;
    const controller = new EmployeesController(employeesService, { log: jest.fn() } as any);
    const res = response();

    await controller.updateStatus(
      'emp-1',
      { status: '离职' },
      { session: { role: 'admin', userId: 'admin-1' } } as any,
      res,
    );

    expect(employeesService.softDelete).toHaveBeenCalledWith('emp-1');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('非主管账号查询员工列表时返回 403，避免绕过前端读取员工数据', async () => {
    const employeesService = {
      findAll: jest.fn(),
    } as any;
    const controller = new EmployeesController(employeesService, { log: jest.fn() } as any);
    const res = response();

    await controller.findAll(
      { session: { role: 'staff' } } as any,
      res,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, message: expect.stringContaining('admin/supervisor') });
    expect(employeesService.findAll).not.toHaveBeenCalled();
  });
});
