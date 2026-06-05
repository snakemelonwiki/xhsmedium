'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { orderStatusMeta } from '@/shared/api/enums';
import { formatDateTime } from '@/shared/utils/date-format';

type ReminderRow = {
  id: string;
  orderId: string;
  userId: string;
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | null;
  reminderSentAt?: string | null;
  isOverdue?: boolean;
  serviceType?: string | null;
  orderStatus?: string | null;
};

const HORIZON_OPTIONS = [
  { label: '已到期 + 未来 24 小时', value: 24 },
  { label: '已到期 + 未来 7 天', value: 24 * 7 },
  { label: '已到期 + 未来 14 天', value: 24 * 14 },
  { label: '仅已到期', value: 0 },
];

/**
 * 教务端节点提醒页：列出当前用户名下/跟进过的订单中 next_remind_at
 * 已到（红色）或在未来 N 小时内到期（黄色）的记录，方便集中处理。
 * 后端 cron 每分钟扫一次发通知，本页是"看哪些已发/将发"的可视入口。
 */
export default function AcademicRemindersPage() {
  const [items, setItems] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<number>(24);
  const [error, setError] = useState('');

  async function load(nextHorizon = horizon) {
    setLoading(true);
    setError('');
    try {
      const payload = await apiClient.get<any>('/orders/reminders/pending', {
        query: { upcomingHours: nextHorizon, limit: 100 },
      });
      const rows = payload?.items ?? [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      const text = err instanceof Error ? err.message : '节点提醒加载失败';
      setError(text);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(horizon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<ReminderRow> = [
    {
      title: '订单',
      dataIndex: 'orderId',
      width: 200,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Link href={`/academic/orders/${value}`}>
            <Typography.Text strong>{value}</Typography.Text>
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
      width: 180,
      render: (value: string | null, record) => {
        if (!value) return '-';
        const date = formatDateTime(value);
        if (record.isOverdue) {
          return <Tag color="red">已到期 · {date}</Tag>;
        }
        return <Tag color="orange">{date}</Tag>;
      },
    },
    {
      title: '已发送',
      dataIndex: 'reminderSentAt',
      width: 100,
      render: (value: string | null) =>
        value ? <Tag color="green">已发</Tag> : <Tag color="default">未发</Tag>,
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
      // v1.3 P0 修复：消费 orderStatusMeta()，避免 awaiting_teacher 等 enum 直接穿透。
      // 与 shared/api/enums 字典保持一致，DB 实际值 → 中文标签 统一由中央字典负责。
      render: (v: string | null) => {
        if (!v) return '-';
        const meta = orderStatusMeta(v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>节点提醒</Typography.Title>
          <Typography.Paragraph type="secondary">
            订单跟进节点到达提醒时间后会在此集中显示。系统每分钟自动扫描并向相关用户推送站内通知。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            value={horizon}
            style={{ width: 220 }}
            options={HORIZON_OPTIONS}
            onChange={(v) => {
              setHorizon(v);
              void load(v);
            }}
          />
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
          locale={{ emptyText: <Empty description="暂无节点提醒" /> }}
          scroll={{ x: 960 }}
        />
      </Card>
    </Space>
  );
}
