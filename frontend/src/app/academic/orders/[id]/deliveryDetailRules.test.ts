import { describe, expect, it } from 'vitest';

import {
  getSubmissionCountByOperationMethod,
  getVisibleFinanceFieldKeys,
  isGraduationProductType,
  normalizeSubmissionRows,
} from './deliveryDetailRules';

describe('deliveryDetailRules', () => {
  it('detects graduation-thesis products so submission blocks can be hidden', () => {
    expect(isGraduationProductType('硕士毕业论文')).toBe(true);
    expect(isGraduationProductType('博士毕业论文')).toBe(true);
    expect(isGraduationProductType('SCI期刊论文')).toBe(false);
  });

  it('derives submission count from operation method', () => {
    expect(getSubmissionCountByOperationMethod('一稿一投')).toBe(1);
    expect(getSubmissionCountByOperationMethod('两稿两投')).toBe(2);
    expect(getSubmissionCountByOperationMethod('三稿三投')).toBe(3);
    expect(getSubmissionCountByOperationMethod(undefined)).toBe(1);
  });

  it('collapses submission rows for graduation-thesis orders', () => {
    expect(
      normalizeSubmissionRows([{ submissionNo: 1 }, { submissionNo: 2 }], {
        productType: '硕士毕业论文',
        operationMethod: '两稿两投',
      }),
    ).toEqual([]);
  });

  it('pads submission rows to the operation-method count', () => {
    expect(
      normalizeSubmissionRows([{ submissionNo: 1 }], {
        productType: 'SCI期刊论文',
        operationMethod: '三稿三投',
      }),
    ).toEqual([{ submissionNo: 1 }, { submissionNo: 2 }, { submissionNo: 3 }]);
  });

  it('limits academic finance visibility to teacher-payment fields', () => {
    expect(getVisibleFinanceFieldKeys('academic')).toEqual([
      'teacherPrice',
      'teacherPaid',
      'teacherPending',
    ]);
    expect(getVisibleFinanceFieldKeys('supervisor')).toEqual([
      'orderAmount',
      'customerPaid',
      'customerPending',
      'teacherPrice',
      'teacherPaid',
      'teacherPending',
    ]);
  });
});
