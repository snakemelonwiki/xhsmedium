'use client';

import { OrderTable } from '@/app/academic/orders/OrderTable';
import { readStoredUser } from '@/shared/auth/auth';

export default function AcademicOrderFollowupPage() {
  const currentUser = readStoredUser();
  const isAcademicSupervisor = currentUser?.role === 'academic_supervisor';

  return (
    <OrderTable
      title="订单跟进"
      description={
        isAcademicSupervisor
          ? '教务主管：查看所有教务订单的跟进状态。'
          : '查看已领取订单，进入详情后维护交付信息与履约节点。'
      }
      scope={isAcademicSupervisor ? 'all' : 'assigned'}
      showStatusFilter
      actionMode="academic"
      listMode="followup"
    />
  );
}
