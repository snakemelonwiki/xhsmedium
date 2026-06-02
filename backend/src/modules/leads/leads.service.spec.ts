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
});
