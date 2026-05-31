'use client';

import { OrderTable } from '@/app/academic/orders/OrderTable';

export default function AdminOrdersPage() {
  return (
    <OrderTable
      title="主管订单"
      description="查看全部订单，保留教务分配入口。"
      scope="all"
      showStatusFilter
      actionMode="admin"
    />
  );
}
