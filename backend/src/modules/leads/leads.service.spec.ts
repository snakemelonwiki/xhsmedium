import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';

describe('LeadsService status normalization', () => {
  const makeRepo = () => ({
    findOne: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (value) => value),
  });

  function service() {
    return new LeadsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;
  }

  it('normalizes legacy status aliases before updates', () => {
    const result = service().normalizeBoardPatch({
      status: 'contact_added',
      addStatus: 'rejected',
      processStatus: '未接',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'added_success',
      addStatus: 'not_passed',
      processStatus: 'not_contacted',
    }));
  });

  it('rejects unknown status values', () => {
    expect(() => service().normalizeBoardPatch({ status: 'random_status' })).toThrow(BadRequestException);
    expect(() => service().normalizeBoardPatch({ addStatus: 'random_add_status' })).toThrow(BadRequestException);
    expect(() => service().normalizeFollowRecord({ content: 'x', processStatus: 'random_process_status' })).toThrow(BadRequestException);
  });

  it('lets assigned sales update addStatus and writes follow record without changing ownership', async () => {
    const leadRepo = makeRepo();
    const followRepo = makeRepo();
    const current = {
      id: 'lead-1',
      employeeId: 'emp-op-1',
      assignedSalesUserId: 'sales-1',
      addStatus: 'not_added',
      processStatus: 'not_contacted',
      intentionLevel: 'pending',
      status: 'assigned',
      updatedAt: new Date('2026-06-02T00:00:00Z'),
      contactInfo: 'wx-1',
    };
    leadRepo.findOne.mockResolvedValue(current);
    const notifications = { create: jest.fn(async () => undefined) };

    const svc = new LeadsService(
      leadRepo as any,
      followRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      notifications as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.updateBoard('lead-1', {
      addStatus: 'added',
      followNote: '客户已通过',
    }, 'sales-1');

    expect(leadRepo.update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({
        addStatus: 'added',
        status: 'added_success',
      }),
    );
    expect(followRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1',
      userId: 'sales-1',
      content: expect.stringContaining('客户已通过'),
    }));
  });

  it('moves process status out of waiting_pass when customer is added', async () => {
    const leadRepo = makeRepo();
    const followRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      employeeId: 'emp-op-1',
      assignedSalesUserId: 'sales-1',
      addStatus: 'applied',
      processStatus: 'waiting_pass',
      intentionLevel: 'pending',
      status: 'in_followup',
      updatedAt: new Date('2026-06-02T00:00:00Z'),
      contactInfo: 'wx-1',
    });

    const svc = new LeadsService(
      leadRepo as any,
      followRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.updateBoard('lead-1', { addStatus: 'added' }, 'sales-1');

    expect(leadRepo.update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({
        addStatus: 'added',
        processStatus: 'communicating',
        status: 'added_success',
      }),
    );
  });

  it('updates contact info only for the assigned sales user', async () => {
    const leadRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      employeeId: 'emp-op-1',
      assignedSalesUserId: 'sales-1',
      contactInfo: 'old-wx',
    });

    const svc = new LeadsService(
      leadRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.updateContactInfo('lead-1', ' new-wx ', {
      actorUserId: 'sales-1',
      actorRole: 'sales',
    });

    expect(leadRepo.update).toHaveBeenCalledWith('lead-1', {
      contactInfo: 'new-wx',
    });

    await expect(
      svc.updateContactInfo('lead-1', 'blocked-wx', {
        actorUserId: 'sales-2',
        actorRole: 'sales',
      }),
    ).rejects.toThrow('not found');
  });

  it('writes purpose from follow record back to the lead intention field', async () => {
    const leadRepo = makeRepo();
    const followRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      employeeId: 'emp-op-1',
      assignedSalesUserId: 'sales-1',
      addStatus: 'added',
      processStatus: 'communicating',
      intentionLevel: 'pending',
      status: 'added_success',
      contactInfo: 'wx-1',
    });

    const svc = new LeadsService(
      leadRepo as any,
      followRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.addFollowRecord('lead-1', 'sales-1', {
      content: '客户确认用途',
      purpose: '评职称',
    } as any);

    expect(leadRepo.update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({
        intention: '评职称',
      }),
    );
  });

  it('stores invalid reason from follow record when intention level is invalid', async () => {
    const leadRepo = makeRepo();
    const followRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      employeeId: 'emp-op-1',
      assignedSalesUserId: 'sales-1',
      addStatus: 'added',
      processStatus: 'communicating',
      intentionLevel: 'pending',
      invalidReason: null,
      status: 'added_success',
      contactInfo: 'wx-1',
    });

    const svc = new LeadsService(
      leadRepo as any,
      followRepo as any,
      {} as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.addFollowRecord('lead-1', 'sales-1', {
      content: '客户确认无效',
      intentionLevel: 'invalid',
      invalidReason: '客户不需要',
    } as any);

    expect(leadRepo.update).toHaveBeenCalledWith(
      'lead-1',
      expect.objectContaining({
        intentionLevel: 'invalid',
        invalidReason: '客户不需要',
      }),
    );
  });

  it('requires invalid reason from follow record when intention level is invalid', async () => {
    const leadRepo = makeRepo();
    const followRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      intentionLevel: 'pending',
      invalidReason: null,
    });

    const svc = new LeadsService(
      leadRepo as any,
      followRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await expect(
      svc.addFollowRecord('lead-1', 'sales-1', {
        content: '客户确认无效',
        intentionLevel: 'invalid',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires invalid reason when intention level is invalid', async () => {
    const leadRepo = makeRepo();
    leadRepo.findOne.mockResolvedValue({
      id: 'lead-1',
      intentionLevel: 'pending',
      invalidReason: null,
    });

    const svc = new LeadsService(
      leadRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await expect(
      svc.updateIntentionLevel('lead-1', 'sales-1', {
        intentionLevel: 'invalid',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores invalid reason for invalid intention level', async () => {
    const leadRepo = makeRepo();
    leadRepo.findOne
      .mockResolvedValueOnce({
        id: 'lead-1',
        intentionLevel: 'pending',
        invalidReason: null,
      })
      .mockResolvedValueOnce({
        id: 'lead-1',
        intentionLevel: 'invalid',
        invalidReason: '客户不需要',
      });

    const svc = new LeadsService(
      leadRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn(async () => []) } as any,
      { create: jest.fn(async () => undefined) } as any,
      { log: jest.fn() } as any,
      {} as any,
    );

    await svc.updateIntentionLevel('lead-1', 'sales-1', {
      intentionLevel: 'invalid',
      invalidReason: '客户不需要',
    });

    expect(leadRepo.update).toHaveBeenCalledWith('lead-1', {
      intentionLevel: 'invalid',
      invalidReason: '客户不需要',
    });
  });
});
