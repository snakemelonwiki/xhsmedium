import { SupervisorSuggestionsController } from './supervisor-suggestions.controller';

describe('SupervisorSuggestionsController', () => {
  it('创建作品建议并返回已保存记录', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ targetType: 'post', targetId: 'post-1', content: '优化标题' }),
    } as any;
    const controller = new SupervisorSuggestionsController(service);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    await controller.create({ targetType: 'post', targetId: 'post-1', content: '优化标题' }, res);

    expect(service.create).toHaveBeenCalledWith({ targetType: 'post', targetId: 'post-1', content: '优化标题' });
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { targetType: 'post', targetId: 'post-1', content: '优化标题' } });
  });

  it('查询建议列表', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([{ targetId: 'post-1', content: '优化标题' }]),
    } as any;
    const controller = new SupervisorSuggestionsController(service);
    const res = { json: jest.fn() } as any;

    await controller.list(res, 'post', 'emp-1');

    expect(service.list).toHaveBeenCalledWith({ targetType: 'post', employeeId: 'emp-1' });
    expect(res.json).toHaveBeenCalledWith({ items: [{ targetId: 'post-1', content: '优化标题' }] });
  });
});
