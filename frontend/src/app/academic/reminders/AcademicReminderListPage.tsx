'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiClient } from '@/shared/api/apiClient';
import { markOrderReminderHandled } from '@/shared/api/orders';
import { orderStatusMeta } from '@/shared/api/enums';
import { formatDateTime, formatRemindTimeTag } from '@/shared/utils/date-format';

type ReminderMode = 'future' | 'today';

type ReminderRow = {
  id: string;
  orderId: string;
  orderCode?: string | null;
  userId: string;
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | null;
  reminderSentAt?: string | null;
  isOverdue?: boolean;
  serviceType?: string | null;
  orderStatus?: string | null;
};

const HORIZON = 168; // 7天，覆盖提前预警窗口

type AcademicReminderListPageProps = {
  title: string;
  description: string;
  mode: ReminderMode;
  emptyDescription: string;
};

/**
 * 教务提醒列表。
 * mode=future：节点提醒，只显示明天起未来窗口内的记事簿提醒。
 * mode=today：今日待提醒，显示今天及以前未确认处理的提醒。
 */
export function AcademicReminderListPage({
  title,
  description,
  mode,
  emptyDescription,
}: AcademicReminderListPageProps) {
  const router = useRouter();
  const [items, setItems] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [handlingId, setHandlingId] = useState('');
  const [error, setError] = useState('');

  async function load(nextHorizon = HORIZON) {
    setLoading(true);
    setError('');
    try {
      const payload = await apiClient.get<any>('/orders/reminders/pending', {
        query: { mode, upcomingHours: nextHorizon, limit: 100 },
      });
      const rows = payload?.items ?? [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      const text = err instanceof Error ? err.message : '提醒加载失败';
      setError(text);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(HORIZON);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleFollowup(id: string, orderId: string) {
    setHandlingId(id);
    try {
      await markOrderReminderHandled(id);
      // 标记已处理后跳转订单详情跟进区域
      router.push(`/academic/orders/${orderId}?target=progress#progress`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setHandlingId('');
    }
  }

  const columns: ColumnsType<ReminderRow> = [
    {
      title: '订单编号',
      dataIndex: 'orderCode',
      width: 200,
      render: (value: string | null, record) => (
        <Space direction="vertical" size={0}>
          <Link href={`/academic/orders/${record.orderId}?target=progress#progress`}>
            <Typography.Text strong>{value || record.orderId}</Typography.Text>
          </Link>
          <Typography.Text type="secondary">{record.serviceType || '未填写服务类型'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '节点',
      dataIndex: 'nodeType',
      width: 140,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '提醒时间',
      dataIndex: 'nextRemindAt',
      width: 160,
      render: (value: string | null) => {
        if (!value) return '-';
        const tag = formatRemindTimeTag(value);
        return <Tag color={tag.color}>{tag.label}</Tag>;
      },
    },
    {
      title: '已发送',
      dataIndex: 'reminderSentAt',
      width: 140,
      render: (value: string | null) =>
        value ? (
          <Tag color="green">已发 · {formatDateTime(value).split(' ')[1] || ''}</Tag>
        ) : (
          <Tag color="default">未发</Tag>
        ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '订单状态',
      dataIndex: 'orderStatus',
      width: 110,
      render: (v: string | null) => {
        if (!v) return '-';
        const meta = orderStatusMeta(v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_value, record) => (
        <Button
          size="small"
          loading={handlingId === record.id}
          onClick={() => handleFollowup(record.id, record.orderId)}
        >
          去跟进
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        <Table<ReminderRow>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description={emptyDescription} /> }}
          scroll={{ x: 960 }}
        />
      </Card>
    </Space>
  );
}
