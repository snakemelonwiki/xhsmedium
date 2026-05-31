import { LeadsController } from './leads.controller';

describe('LeadsController pagination', () => {
  const response = () => ({
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('默认按 20 条分页返回客资列表', async () => {
    const leadsService = {
      findAllPage: jest.fn().mockResolvedValue({ total: 21, items: [{ id: 'lead-1' }] }),
    } as any;
    const controller = new LeadsController(leadsService);
    const res = response();

    await controller.findAll({ session: { role: 'admin' }, query: {} } as any, res);

    expect(leadsService.findAllPage).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(res.json).toHaveBeenCalledWith({ total: 21, items: [{ id: 'lead-1' }] });
  });

  it('支持 page/pageSize 查询参数', async () => {
    const leadsService = {
      findAllPage: jest.fn().mockResolvedValue({ total: 100, items: [{ id: 'lead-21' }] }),
    } as any;
    const controller = new LeadsController(leadsService);
    const res = response();

    await controller.findAll({ session: { role: 'admin' }, query: { page: '2', pageSize: '20' } } as any, res);

    expect(leadsService.findAllPage).toHaveBeenCalledWith({ limit: 20, offset: 20 });
    expect(res.json).toHaveBeenCalledWith({ total: 100, items: [{ id: 'lead-21' }] });
  });

  it('staff 默认只分页返回本人客资，scope=all 返回全量分页', async () => {
    const leadsService = {
      findByEmployeePage: jest.fn().mockResolvedValue({ total: 3, items: [{ id: 'lead-self' }] }),
      findAllPage: jest.fn().mockResolvedValue({ total: 10, items: [{ id: 'lead-all' }] }),
    } as any;
    const controller = new LeadsController(leadsService);
    const selfRes = response();
    const allRes = response();

    await controller.findAll({ session: { role: 'staff', employeeId: 'emp-1' }, query: {} } as any, selfRes);
    await controller.findAll({ session: { role: 'staff', employeeId: 'emp-1' }, query: { scope: 'all', limit: '10', offset: '10' } } as any, allRes, 'all');

    expect(leadsService.findByEmployeePage).toHaveBeenCalledWith('emp-1', { limit: 20, offset: 0 });
    expect(leadsService.findAllPage).toHaveBeenCalledWith({ limit: 10, offset: 10 });
    expect(selfRes.json).toHaveBeenCalledWith({ total: 3, items: [{ id: 'lead-self' }] });
    expect(allRes.json).toHaveBeenCalledWith({ total: 10, items: [{ id: 'lead-all' }] });
  });
});
