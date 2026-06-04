'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import { useRouter } from 'next/navigation';

import { OrderTable } from '@/app/academic/orders/OrderTable';
import { createExport, getExport, downloadExportUrl } from '@/shared/api/exports';

export default function SalesOrdersPage() {
  const router = useRouter();

  async function exportMyOrders() {
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const result = await createExport({
        exportType: 'orders',
        filter: { scope: 'mine' },
      });

      // 轮询导出状态，最多等待30秒
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);

        if (exportTask.status === 'completed') {
          hide();
          const downloadUrl = downloadExportUrl(result.id);
          window.open(downloadUrl, '_blank');
          message.success('导出成功，文件开始下载');
          return;
        } else if (exportTask.status === 'failed') {
          hide();
          message.error('导出失败，请重试');
          return;
        }

        attempts++;
      }

      hide();
      message.warning('导出任务进行中，请稍后在导出记录中下载');
    } catch (err) {
      hide();
      message.error(err instanceof Error ? err.message : '导出失败');
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
