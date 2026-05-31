import { ImportTask } from '../../entities/import-task.entity';
import { ImportsService } from './imports.service';

describe('ImportsService #7 import tasks', () => {
  const buildService = (rows: ImportTask[]) => {
    const repo = {
      find: jest.fn().mockResolvedValue(rows),
    };
    const service = new ImportsService(repo as any, {} as any, {} as any, {} as any, {} as any);
    return { service, repo };
  };

  it('lists import tasks for current user and type', async () => {
    const task = {
      id: 'task-1',
      importType: 'posts',
      userId: 'user-1',
      totalCount: 3,
      successCount: 2,
      failCount: 1,
      errorFileUrl: '/uploads/import-errors/task-1.csv',
      createdAt: new Date('2026-05-30T00:00:00Z'),
    } as ImportTask;
    const { service, repo } = buildService([task]);

    const result = await service.listTasks('user-1', 'posts');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', importType: 'posts' },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'task-1',
        userId: 'user-1',
        errorFileUrl: '/uploads/import-errors/task-1.csv',
      }),
    ]);
  });
});
