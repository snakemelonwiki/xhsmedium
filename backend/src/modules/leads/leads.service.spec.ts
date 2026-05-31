import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';

describe('LeadsService status normalization', () => {
  function service() {
    return new LeadsService(
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
});
