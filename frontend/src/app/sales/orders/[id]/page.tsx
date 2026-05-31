'use client';

import { Button, Card, Descriptions, Empty, Space, Spin, Timeline, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getOrderDetail, listOrderFollowRecords } from '@/shared/api/orders';
import type { OrderFollowRecord, OrderItem } from '@/shared/types/orders';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function emptyText(value?: string | null) {
  return value || '-';
}

export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id);
  const [order, setOrder] = useState<OrderItem>();
  const [records, setRecords] = useState<OrderFollowRecord[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadDetail() {
    setLoading(true);
    try {
      const [detail, followRecords] = await Promise.all([
        getOrderDetail(orderId),
        listOrderFollowRecords(orderId),
      ]);
      setOrder(detail);
      setRecords(followRecords);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单详情加载失败');
      setOrder(undefined);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>订单详情</Typography.Title>
          <Typography.Paragraph type="secondary">查看订单履约状态和教务跟进时间线。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => router.push('/sales/orders')}>返回列表</Button>
          <Button onClick={loadDetail} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card>
            <Descriptions
              bordered
              column={{ xs: 1, md: 2 }}
              items={[
                { key: 'id', label: '订单 ID', children: orderId },
                { key: 'leadId', label: '客资 ID', children: emptyText(order?.leadId) },
                { key: 'serviceType', label: '服务类型', children: emptyText(order?.serviceType) },
                { key: 'amount', label: '金额', children: emptyText(order?.amount) },
                { key: 'paidStatus', label: '付款状态', children: emptyText(order?.paidStatus) },
                { key: 'orderStatus', label: '订单状态', children: emptyText(order?.orderStatus) },
                { key: 'sales', label: '销售', children: emptyText(order?.salesName ?? order?.salesUserId) },
                { key: 'academic', label: '教务', children: emptyText(order?.academicName ?? order?.academicUserId) },
                { key: 'createdAt', label: '创建时间', children: formatDate(order?.createdAt) },
                { key: 'updatedAt', label: '更新时间', children: formatDate(order?.updatedAt) },
                { key: 'remark', label: '备注', children: emptyText(order?.remark) },
              ]}
            />
          </Card>

          <Card title="跟进时间线">
            {records.length > 0 ? (
              <Timeline
                items={records.map((record) => ({
                  key: record.id,
                  children: (
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{record.nodeType}</Typography.Text>
                      <Typography.Text>{emptyText(record.content)}</Typography.Text>
                      <Typography.Text type="secondary">
                        {formatDate(record.createdAt)}
                        {record.nextRemindAt ? ` | 下次提醒：${formatDate(record.nextRemindAt)}` : ''}
                      </Typography.Text>
                    </Space>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录" />
            )}
          </Card>
        </Space>
      </Spin>
    </Space>
  );
}
