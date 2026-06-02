import { CollaborationTasksService } from './collaboration-tasks.service';

describe('CollaborationTasksService', () => {
  const makeRepo = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    update: jest.fn(async () => ({ affected: 1 })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  it('creates task, assigns source operator as handler, and moves lead into collaboration', async () => {
    const taskRepo = makeRepo();
    const leadRepo = makeRepo();
    const userRepo = makeRepo();
    const notifications = { create: jest.fn(async () => undefined) };
    leadRepo.findOne.mockResolvedValue({ id: 'lead-1', employeeId: 'emp-1', contactInfo: 'wx-1' });
    userRepo.findOne.mockResolvedValue({ id: 'op-user-1' });

    const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
    const task = await service.create({
      leadId: 'lead-1',
      requesterId: 'sales-1',
      type: 'remind_customer',
      reason: 'please remind',
    });

    expect(task.handlerId).toBe('op-user-1');
    expect(task.status).toBe('pending');
    expect(leadRepo.update).toHaveBeenCalledWith('lead-1', { status: 'in_collaboration' });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      receiverIds: ['op-user-1'],
      senderId: 'sales-1',
      relatedType: 'collaboration_task',
    }));
  });

  it('handles task and writes operation handled state back to lead', async () => {
    const taskRepo = makeRepo();
    const leadRepo = makeRepo();
    const userRepo = makeRepo();
    const notifications = { create: jest.fn(async () => undefined) };
    taskRepo.findOne
      .mockResolvedValueOnce({
        id: 'task-1',
        leadId: 'lead-1',
        requesterId: 'sales-1',
        handlerId: null,
        status: 'pending',
      })
      .mockResolvedValueOnce({ id: 'task-1', status: 'handled', handledNote: 'done' });

    const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
    const task = await service.handle('task-1', 'done', 'op-user-1');

    expect(task).toMatchObject({ id: 'task-1', status: 'handled' });
    expect(taskRepo.update).toHaveBeenCalledWith('task-1', expect.objectContaining({
      status: 'handled',
      handlerId: 'op-user-1',
      handledNote: 'done',
    }));
    expect(leadRepo.update).toHaveBeenCalledWith('lead-1', {
      status: 'operation_handled',
      addStatus: 'operation_reminded',
    });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      receiverIds: ['sales-1'],
      senderId: 'op-user-1',
      // N-P1-06 修复：relatedId 指向 task.id（与 COLLAB_REQUESTED 行为一致），
      // 让 routeHint /sales/collaboration?taskId=<id> 能定位到任务页。
      // 旧实现 relatedId=task.leadId + relatedType='lead' 会跳到客资详情而非任务。
      relatedId: 'task-1',
      relatedType: 'collaboration_task',
    }));
  });

  it('uses an explicit collation when joining leads for inbox lists', async () => {
    const taskRepo = makeRepo();
    const leadRepo = makeRepo();
    const userRepo = makeRepo();
    const notifications = { create: jest.fn(async () => undefined) };
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    taskRepo.createQueryBuilder.mockReturnValue(qb);

    const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
    await service.listPaged({
      scope: 'inbox',
      status: 'pending',
      userId: 'user-test-staff-01',
      employeeId: 'emp-test-staff-01',
      role: 'staff',
      limit: 20,
      offset: 0,
    });

    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'l',
      expect.stringContaining('COLLATE utf8mb4_unicode_ci'),
    );
  });

  // TC-PERM-037 P0 修复：close 越权回归
  describe('close (TC-PERM-037)', () => {
    it('allows requester to close their own task', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne
        .mockResolvedValueOnce({
          id: 'task-1',
          leadId: 'lead-1',
          requesterId: 'sales-1',
          status: 'handled',
        })
        .mockResolvedValueOnce({ id: 'task-1', status: 'closed' });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'sales-1', actorRole: 'sales' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
      expect(taskRepo.update).toHaveBeenCalledWith('task-1', { status: 'closed' });
    });

    it('rejects another sales user closing someone else task', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        leadId: 'lead-1',
        requesterId: 'sales-1',
        status: 'handled',
      });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      await expect(
        service.close('task-1', { actorUserId: 'sales-2', actorRole: 'sales' }),
      ).rejects.toThrow(/no permission to close task/);
      expect(taskRepo.update).not.toHaveBeenCalled();
    });

    it('allows admin to close any task', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne
        .mockResolvedValueOnce({
          id: 'task-1',
          leadId: 'lead-1',
          requesterId: 'sales-1',
          status: 'handled',
        })
        .mockResolvedValueOnce({ id: 'task-1', status: 'closed' });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'admin-1', actorRole: 'admin' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
      expect(taskRepo.update).toHaveBeenCalledWith('task-1', { status: 'closed' });
    });

    it('allows owner to close any task', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne
        .mockResolvedValueOnce({
          id: 'task-1',
          leadId: 'lead-1',
          requesterId: 'sales-1',
          status: 'handled',
        })
        .mockResolvedValueOnce({ id: 'task-1', status: 'closed' });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'owner-1', actorRole: 'owner' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
    });

    it('rejects operation/staff closing (close is requester/admin only)', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        leadId: 'lead-1',
        requesterId: 'sales-1',
        status: 'handled',
      });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      await expect(
        service.close('task-1', { actorUserId: 'op-1', actorRole: 'staff' }),
      ).rejects.toThrow(/no permission to close task/);
      expect(taskRepo.update).not.toHaveBeenCalled();
    });

    it('is idempotent on already-closed task (does not throw)', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        leadId: 'lead-1',
        requesterId: 'sales-1',
        status: 'closed',
      });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'sales-1', actorRole: 'sales' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
      expect(taskRepo.update).not.toHaveBeenCalled();
    });

    // S-P1-04 修复：close 协同后回退 lead.status in_collaboration→in_followup。
    it('rolls back lead.status from in_collaboration to in_followup after close', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne
        .mockResolvedValueOnce({
          id: 'task-1',
          leadId: 'lead-1',
          requesterId: 'sales-1',
          status: 'handled',
        })
        .mockResolvedValueOnce({ id: 'task-1', status: 'closed' });
      // close 成功后查 lead → 当前 status = in_collaboration（由 create() 写入）
      leadRepo.findOne.mockResolvedValue({ id: 'lead-1', status: 'in_collaboration' });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'sales-1', actorRole: 'sales' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
      expect(taskRepo.update).toHaveBeenCalledWith('task-1', { status: 'closed' });
      // 关键断言：lead.status 已被回退到 in_followup
      expect(leadRepo.update).toHaveBeenCalledWith('lead-1', { status: 'in_followup' });
    });

    it('does not touch lead.status when lead is not in_collaboration', async () => {
      const taskRepo = makeRepo();
      const leadRepo = makeRepo();
      const userRepo = makeRepo();
      const notifications = { create: jest.fn(async () => undefined) };
      taskRepo.findOne
        .mockResolvedValueOnce({
          id: 'task-1',
          leadId: 'lead-1',
          requesterId: 'sales-1',
          status: 'handled',
        })
        .mockResolvedValueOnce({ id: 'task-1', status: 'closed' });
      // 假设 lead 已经被运营处理过，status = operation_handled（不可覆盖）
      leadRepo.findOne.mockResolvedValue({ id: 'lead-1', status: 'operation_handled' });

      const service = new CollaborationTasksService(taskRepo as any, leadRepo as any, userRepo as any, notifications as any, { log: jest.fn() } as any);
      const task = await service.close('task-1', { actorUserId: 'sales-1', actorRole: 'sales' });

      expect(task).toMatchObject({ id: 'task-1', status: 'closed' });
      // 关键断言：lead 状态不是 in_collaboration 时，不能被错误覆盖
      expect(leadRepo.update).not.toHaveBeenCalled();
    });
  });
});
