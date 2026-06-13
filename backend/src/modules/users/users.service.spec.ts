import { UsersService } from './users.service';

describe('UsersService sales assignment candidates', () => {
  function createService(query: jest.Mock, update = jest.fn()) {
    return new UsersService({
      manager: { query },
      update,
    } as any);
  }

  it('queries only real active sales users and deduplicates by employee name', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'sales-user-1',
          username: 'luowenhui_new',
          role: 'sales',
          employeeId: 'emp-2',
          status: 'active',
          capacityPaused: 0,
          capacityPausedAt: null,
          createdAt: new Date('2026-06-13T08:00:00.000Z'),
          employeeName: '罗文慧',
        },
      ])
      .mockResolvedValueOnce([{ total: 1 }]);
    const service = createService(query);

    const result = await service.findAssignableSalesUsersPaged({ limit: 200, offset: 0 });

    const listSql = query.mock.calls[0][0] as string;
    const countSql = query.mock.calls[1][0] as string;
    expect(listSql).toContain("NOT REGEXP '^sales[0-9]+$'");
    expect(countSql).toContain("NOT REGEXP '^sales[0-9]+$'");
    expect(listSql).toContain('u2.employee_id = u.employee_id');
    expect(listSql).toContain('e3.name = e.name');
    expect(countSql).toContain('COUNT(DISTINCT e.name)');
    expect(result).toEqual({
      items: [
        {
          id: 'sales-user-1',
          username: 'luowenhui_new',
          role: 'sales',
          employeeId: 'emp-2',
          status: 'active',
          employeeName: '罗文慧',
          capacityPaused: false,
          capacityPausedAt: null,
          createdAt: '2026-06-13T08:00:00.000Z',
        },
      ],
      total: 1,
      limit: 200,
      offset: 0,
    });
  });
});
