import { OrderTable } from './OrderTable';

export default function AcademicOrdersPage() {
  return (
    <OrderTable
      title="订单池"
      description="查看教务订单池，支持领取入口与订单状态更新。"
      scope="academic"
      actionMode="academic"
    />
  );
}
