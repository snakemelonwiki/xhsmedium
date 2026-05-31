import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  const response = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as any;

  it('returns paged lead list when limit or offset is present', async () => {
    const leadsService = {
      findFilteredPaged: jest.fn().mockResolvedValue({ total: 21, items: [{ id: 'lead-1' }], limit: 20, offset: 0 }),
    } as any;
    const controller = new LeadsController(leadsService, {} as any);
    const res = response();

    await controller.findAll(
      { session: { role: 'sales', userId: 'sales-1', employeeId: 'emp-sales' } } as any,
      res,
      undefined,
      '20',
      undefined,
    );

    expect(leadsService.findFilteredPaged).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'self',
        actorUserId: 'sales-1',
        actorEmployeeId: 'emp-sales',
        actorRole: 'sales',
      }),
      20,
      0,
    );
    expect(res.json).toHaveBeenCalledWith({ total: 21, items: [{ id: 'lead-1' }], limit: 20, offset: 0 });
  });

  it('updates sales status through PATCH /leads/:id/status', async () => {
    const leadsService = {
      canAccessLead: jest.fn().mockResolvedValue(true),
      updateSalesStatus: jest.fn().mockResolvedValue({ id: 'lead-1', addStatus: 'added', status: 'added_success' }),
    } as any;
    const controller = new LeadsController(leadsService, {} as any);
    const res = response();

    await controller.updateStatus(
      'lead-1',
      { addStatus: 'added', followNote: '通过了' },
      { session: { userId: 'sales-1' } } as any,
      res,
    );

    expect(leadsService.updateSalesStatus).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({ addStatus: 'added', followNote: '通过了' }),
      'sales-1',
    );
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      lead: { id: 'lead-1', addStatus: 'added', status: 'added_success' },
    });
  });

  it('creates collaboration task from lead route', async () => {
    const collaborationTasksService = {
      create: jest.fn().mockResolvedValue({ id: 'task-1', leadId: 'lead-1' }),
    } as any;
    const leadsService = {
      canAccessLead: jest.fn().mockResolvedValue(true),
    } as any;
    const controller = new LeadsController(leadsService, collaborationTasksService);
    const res = response();

    await controller.createCollaboration(
      'lead-1',
      { type: 'remind_customer', reason: '提醒客户' },
      { session: { userId: 'sales-1' } } as any,
      res,
    );

    expect(collaborationTasksService.create).toHaveBeenCalledWith({
      leadId: 'lead-1',
      type: 'remind_customer',
      reason: '提醒客户',
      requesterId: 'sales-1',
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true, task: { id: 'task-1', leadId: 'lead-1' } });
  });
});
