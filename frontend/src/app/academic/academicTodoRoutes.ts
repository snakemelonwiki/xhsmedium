export type AcademicTodoType =
  | 'pendingReceive'
  | 'inProgress'
  | 'waitingMaterial'
  | 'waitingTeacher'
  | 'nearDue'
  | 'abnormal';

export type AcademicTodoTarget = {
  orderId?: string | null;
  type: AcademicTodoType;
};

const FALLBACK_ROUTES: Record<AcademicTodoType, string> = {
  pendingReceive: '/academic/orders?scope=pool&status=to_receive',
  inProgress: '/academic/followup?status=in_progress',
  waitingMaterial: '/academic/followup?status=awaiting_client_info',
  waitingTeacher: '/academic/followup?status=awaiting_teacher',
  nearDue: '/academic/followup?status=near_due',
  abnormal: '/academic/abnormal',
};

const ORDER_TARGETS: Partial<Record<AcademicTodoType, string>> = {
  waitingMaterial: 'client-info',
  waitingTeacher: 'teacher',
  nearDue: 'progress',
};

export function buildAcademicTodoHref(target: AcademicTodoTarget): string {
  const orderId = target.orderId?.trim();
  const anchor = ORDER_TARGETS[target.type];
  if (orderId && anchor) {
    return `/academic/orders/${encodeURIComponent(orderId)}?todo=${target.type}&target=${anchor}#${anchor}`;
  }
  if (orderId && target.type === 'pendingReceive') {
    return `/academic/orders/${encodeURIComponent(orderId)}?todo=${target.type}`;
  }
  return FALLBACK_ROUTES[target.type];
}
