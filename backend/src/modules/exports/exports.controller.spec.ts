import { ExportsController } from './exports.controller';

describe('ExportsController A端导出契约', () => {
  it('允许主管创建账号导出任务', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'export-1', status: 'processing' }),
    } as any;
    const operationLogs = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const controller = new ExportsController(service, operationLogs);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    await controller.create(
      { exportType: 'accounts', filter: { scope: 'all' } },
      { session: { userId: 'admin-1', role: 'admin' } } as any,
      res,
    );

    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1',
      userRole: 'admin',
      exportType: 'accounts',
    }));
    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'export-1', status: 'processing' });
  });

  it('运营创建账号导出时会忽略 scope=all 并降级到 mine', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'export-staff-1', status: 'processing' }),
    } as any;
    const operationLogs = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const controller = new ExportsController(service, operationLogs);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    await controller.create(
      { exportType: 'accounts', filter: { scope: 'all' } },
      { session: { userId: 'staff-1', role: 'staff', employeeId: 'emp-1' } } as any,
      res,
    );

    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'staff-1',
      userRole: 'staff',
      exportType: 'accounts',
      filterJson: expect.objectContaining({
        currentEmployeeId: 'emp-1',
        scope: 'mine',
      }),
    }));
    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'export-staff-1', status: 'processing' });
  });

  it('下载完成的导出文件时重定向到文件地址', async () => {
    const service = {
      resolveDownload: jest.fn().mockResolvedValue({
        ok: true,
        redirectUrl: '/uploads/exports/export-1.csv',
        fileSize: 0,
        contentType: 'text/csv; charset=utf-8',
        ext: 'csv',
        exportType: 'accounts',
      }),
      logDownload: jest.fn().mockResolvedValue(undefined),
    } as any;
    const operationLogs = { log: jest.fn().mockResolvedValue(undefined) } as any;
    const controller = new ExportsController(service, operationLogs);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
      setHeader: jest.fn(),
    } as any;

    await controller.download(
      'export-1',
      { headers: {}, session: { userId: 'admin-1', role: 'admin' }, socket: {} } as any,
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith('/uploads/exports/export-1.csv');
  });
});
