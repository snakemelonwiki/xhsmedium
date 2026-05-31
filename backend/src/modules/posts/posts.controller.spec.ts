import { PostsController } from './posts.controller';

describe('PostsController permissions', () => {
  const buildController = (post: any) => {
    const postsService = {
      findById: jest.fn().mockResolvedValue(post),
      update: jest.fn(),
      remove: jest.fn(),
    } as any;
    const controller = new PostsController(postsService, {} as any);
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    return { controller, postsService, response };
  };

  it('拒绝 staff 修改他人作品', async () => {
    const { controller, postsService, response } = buildController({
      id: 'post-1',
      employeeId: 'employee-owner',
    });
    const request = { session: { role: 'staff', employeeId: 'employee-other' } } as any;

    await controller.update('post-1', { title: '越权修改' }, request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(postsService.update).not.toHaveBeenCalled();
  });

  it('拒绝 staff 删除他人作品', async () => {
    const { controller, postsService, response } = buildController({
      id: 'post-1',
      employeeId: 'employee-owner',
    });
    const request = { session: { role: 'staff', employeeId: 'employee-other' } } as any;

    await controller.remove('post-1', request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(postsService.remove).not.toHaveBeenCalled();
  });
});

describe('PostsController pagination', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('默认按 20 条分页返回作品列表', async () => {
    const postsService = {
      findPaged: jest.fn().mockResolvedValue({ total: 21, items: [{ id: 'post-1' }], limit: 20, offset: 0 }),
    } as any;
    const controller = new PostsController(postsService, {} as any);
    const res = response();

    await controller.findAll({ session: { role: 'admin', userId: '' } } as any, res, '20', '0');

    expect(postsService.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({}),
      20,
      0,
    );
    expect(res.json).toHaveBeenCalledWith({ total: 21, items: [{ id: 'post-1' }], limit: 20, offset: 0 });
  });

  it('支持 limit/offset 查询参数', async () => {
    const postsService = {
      findPaged: jest.fn().mockResolvedValue({ total: 30, items: [{ id: 'post-11' }], limit: 10, offset: 10 }),
    } as any;
    const controller = new PostsController(postsService, {} as any);
    const res = response();

    await controller.findAll({ session: { role: 'staff', employeeId: 'emp-1', userId: '' } } as any, res, '10', '10');

    expect(postsService.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'emp-1' }),
      10,
      10,
    );
    expect(res.json).toHaveBeenCalledWith({ total: 30, items: [{ id: 'post-11' }], limit: 10, offset: 10 });
  });
});
