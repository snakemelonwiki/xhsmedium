import { OrderTable } from '@/app/academic/orders/OrderTable';

export default function AcademicAbnormalOrdersPage() {
  return (
    <OrderTable
      title="异常订单"
      description="筛选异常或指定状态订单，并保留处理动作入口。"
      scope="academic"
      status="abnormal"
      showStatusFilter
      actionMode="abnormal"
    />
  );
}
