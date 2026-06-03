import { SupervisorSuggestionsController } from './supervisor-suggestions.controller';

describe('SupervisorSuggestionsController', () => {
  const response = () => ({
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  }) as any;

  it('创建作品建议并返回已保存记录', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ targetType: 'post', targetId: 'post-1', content: '优化标题' }),
    } as any;
    const controller = new SupervisorSuggestionsController(service);
    const res = response();
    const req = { session: { role: 'admin' }, body: { targetType: 'post', targetId: 'post-1', content: '优化标题' } } as any;

    await controller.create(req.body, req, res);

    expect(service.create).toHaveBeenCalledWith({ senderId: '', targetType: 'post', targetId: 'post-1', content: '优化标题' });
    expect(res.json).toHaveBeenCalled();
  });

  it('查询建议列表', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([{ targetId: 'post-1', content: '优化标题' }]),
    } as any;
    const controller = new SupervisorSuggestionsController(service);
    const res = response();
    const req = { session: { role: 'admin' }, query: {} } as any;

    await controller.list(req, res, undefined, undefined);

    expect(service.list).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ items: [{ targetId: 'post-1', content: '优化标题' }] });
  });
});
