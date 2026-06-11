'use client';

import { OrderTable } from '@/app/academic/orders/OrderTable';

export default function AcademicOrderFollowupPage() {
  return (
    <OrderTable
      title="订单跟进"
      description="查看已领取订单，进入详情后维护交付信息与履约节点。"
      scope="assigned"
      showStatusFilter
      actionMode="academic"
      listMode="followup"
    />
  );
}
