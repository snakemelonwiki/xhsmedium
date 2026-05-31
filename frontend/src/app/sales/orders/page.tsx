'use client';

import { OrderTable } from '@/app/academic/orders/OrderTable';

export default function SalesOrdersPage() {
  return (
    <OrderTable
      title="销售订单"
      description="查看当前销售相关订单与履约状态。"
      scope="sales"
      actionMode="sales"
    />
  );
}
