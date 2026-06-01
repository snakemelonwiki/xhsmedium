'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { OrderTable } from '@/app/academic/orders/OrderTable';
import { closeAbnormalFeedback, listAbnormalFeedbacks } from '@/shared/api/orders';
import type { OrderItem } from '@/shared/types/orders';

/**
 * 教务端"异常订单"列表。
 * - 列表行增加"关闭"按钮：取该订单最近一条未关闭的异常反馈进行关闭。
 * - 顶部"导出异常记录"按钮：当前后端尚未实现 order_abnormal 导出类型，
 *   前端先 disable + Tooltip 提示，避免误点。
 */
export default function AcademicAbnormalOrdersPage() {
  const router = useRouter();
  const [closingIds, setClosingIds] = useState<Record<string, boolean>>({});

  async function closeOrderAbnormal(order: OrderItem) {
    if (closingIds[order.id]) return;
    setClosingIds((prev) => ({ ...prev, [order.id]: true }));
    try {
      const feedbacks = await listAbnormalFeedbacks(order.id).catch(() => []);
      const open = feedbacks.find((fb) => fb.status !== 'closed');
      if (!open) {
        message.warning('该订单当前没有未关闭的异常反馈，请到订单详情处理');
        router.push(`/academic/orders/${order.id}`);
        return;
      }
      await closeAbnormalFeedback(order.id, open.id, { status: 'closed' });
      message.success(`订单 ${order.id} 的异常已关闭`);
      router.refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '关闭失败');
    } finally {
      setClosingIds((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
    }
  }

  return (
    <OrderTable
      title="异常订单"
      description="筛选异常或指定状态订单，并保留处理动作入口。"
      scope="academic"
      status="abnormal"
      showStatusFilter
      actionMode="abnormal"
      toolbarExtra={
        <Tooltip title="导出类型待后端补齐">
          <Button icon={<DownloadOutlined />} disabled>
            导出异常记录
          </Button>
        </Tooltip>
      }
      renderRowExtra={(record) => (
        <Space>
          <Button
            size="small"
            loading={Boolean(closingIds[record.id])}
            onClick={() => closeOrderAbnormal(record)}
          >
            关闭
          </Button>
        </Space>
      )}
    />
  );
}
