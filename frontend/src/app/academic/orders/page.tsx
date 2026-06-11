import { OrderTable } from './OrderTable';

export default function AcademicOrdersPage() {
  return (
    <OrderTable
      title="订单池"
      description="只展示销售已交接、等待教务领取的订单；领取后会进入订单跟进。"
      scope="pool"
      actionMode="academic"
      listMode="claimPool"
    />
  );
}
