import type { AppRole } from '@/shared/auth/auth';
import type { OrderDeliverySubmission } from '@/shared/types/orders';

type SubmissionContext = {
  productType?: string | null;
  operationMethod?: string | null;
};

const GRADUATION_PRODUCT_KEYWORD = '毕业论文';

const OPERATION_METHOD_TO_COUNT: Record<string, number> = {
  一稿一投: 1,
  两稿两投: 2,
  三稿三投: 3,
};

const FINANCE_FIELD_KEYS = {
  supervisor: ['orderAmount', 'customerPaid', 'customerPending', 'teacherPrice', 'teacherPaid', 'teacherPending'],
  academic: ['teacherPrice', 'teacherPaid', 'teacherPending'],
} as const;

/**
 * 判断当前订单是否属于毕业论文，只展示作者登记相关信息。
 */
export function isGraduationProductType(productType?: string | null): boolean {
  return String(productType || '').includes(GRADUATION_PRODUCT_KEYWORD);
}

/**
 * 按操作方式推导应展示的投稿信息份数。
 */
export function getSubmissionCountByOperationMethod(operationMethod?: string | null): number {
  return OPERATION_METHOD_TO_COUNT[String(operationMethod || '')] ?? 1;
}

/**
 * 按产品类型与操作方式整理投稿子表单行数。
 */
export function normalizeSubmissionRows(
  submissions: OrderDeliverySubmission[],
  context: SubmissionContext,
): OrderDeliverySubmission[] {
  if (isGraduationProductType(context.productType)) {
    return [];
  }

  const requiredCount = getSubmissionCountByOperationMethod(context.operationMethod);
  const nextRows = submissions.slice(0, requiredCount).map((item, index) => ({
    ...item,
    submissionNo: item.submissionNo ?? index + 1,
  }));

  while (nextRows.length < requiredCount) {
    nextRows.push({ submissionNo: nextRows.length + 1 });
  }

  return nextRows;
}

/**
 * 教务端财务信息按角色做字段级展示控制。
 */
export function getVisibleFinanceFieldKeys(role?: AppRole): readonly string[] {
  if (role === 'academic') {
    return FINANCE_FIELD_KEYS.academic;
  }
  return FINANCE_FIELD_KEYS.supervisor;
}
