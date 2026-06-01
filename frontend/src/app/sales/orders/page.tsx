'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import { useRouter } from 'next/navigation';

import { OrderTable } from '@/app/academic/orders/OrderTable';
import { createExport } from '@/shared/api/exports';

export default function SalesOrdersPage() {
  const router = useRouter();

  async function exportMyOrders() {
    try {
      const result = await createExport({
        exportType: 'orders',
        filter: { scope: 'mine' },
      });
      message.success(`导出任务已创建（#${result.id.slice(0, 8)}），完成后会通知`);
      router.push('/academic/exports');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出任务创建失败');
    }
  }

  const toolbarExtra = (
    <Button icon={<DownloadOutlined />} onClick={exportMyOrders}>
      导出我的订单
    </Button>
  );

  return (
    <OrderTable
      title="销售订单"
      description="查看当前销售相关订单与履约状态；选择「仅含异常」可筛出教务已上报异常的订单。"
      scope="sales"
      actionMode="sales"
      toolbarExtra={toolbarExtra}
    />
  );
}
