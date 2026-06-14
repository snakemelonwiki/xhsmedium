import { describe, expect, it } from 'vitest';

import { DELIVERY_PROGRESS_STAGES } from './deliveryProgressModel';

describe('DELIVERY_PROGRESS_STAGES', () => {
  it('keeps the five progress steps required by the academic delivery detail design', () => {
    expect(DELIVERY_PROGRESS_STAGES.map((item) => item.label)).toEqual([
      '初始',
      '分配老师',
      '写作审核',
      '投稿准备',
      '投稿后',
    ]);
  });

  it('keeps the initial step fields aligned with the academic detail screenshot', () => {
    expect(DELIVERY_PROGRESS_STAGES[0]?.fields).toEqual([
      'responsibleTeacher',
      'statusStage',
      'paperProgress',
      'salesContact',
      'academicOwner',
    ]);
  });

  it('shows teacher assignment fields only in the assignment step', () => {
    expect(DELIVERY_PROGRESS_STAGES[1]?.fields).toEqual([
      'assignedTeacher',
      'teacherWechat',
      'teacherPhone',
      'teacherStability',
    ]);
  });
});
