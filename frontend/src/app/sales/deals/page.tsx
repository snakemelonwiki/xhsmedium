'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listMyDeals } from '@/shared/api/leads';
import { formatDateTime } from '@/shared/utils/date-format';

const PRODUCT_TYPE_OPTIONS = [
  { label: '全部产品', value: '' },
  { label: '专利', value: '专利' },
  { label: '期刊论文', value: '期刊论文' },
  { label: '硕士毕业论文', value: '硕士毕业论文' },
  { label: '博士毕业论文', value: '博士毕业论文' },
  { label: '基金', value: '基金' },
  { label: 'EI 会议', value: 'EI会议' },
  { label: '普刊', value: '普刊' },
  { label: '国际会议', value: '国际会议' },
];

const ORDER_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待领取', value: 'to_receive' },
  { label: '进行中', value: 'in_progress' },
  { label: '待客户资料', value: 'awaiting_client_info' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '异常', value: 'abnormal' },
];

const orderStatusMeta: Record<string, { label: string; color: string }> = {
  to_receive: { label: '待领取', color: 'orange' },
  in_progress: { label: '进行中', color: 'blue' },
  awaiting_client_info: { label: '待客户资料', color: 'gold' },
  awaiting_teacher: { label: '待老师', color: 'purple' },
  to_deliver: { label: '待交付', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  abnormal: { label: '异常', color: 'red' },
};

type Filters = {
  status: string;
  productType: string;
  dateRange: [Dayjs, Dayjs] | null;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  productType: '',
  dateRange: null,
};

export default function SalesDealsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await listMyDeals({
        status: filters.status || undefined,
        productType: filters.productType || undefined,
        startDate: filters.dateRange?.[0]?.startOf('day').toISOString() || undefined,
        endDate: filters.dateRange?.[1]?.endOf('day').toISOString() || undefined,
        page,
        pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '我的成交加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.productType, filters.dateRange?.[0]?.valueOf(), filters.dateRange?.[1]?.valueOf()]);

  const columns: TableColumnsType<Record<string, unknown>> = [
    {
      title: '订单编号',
      dataIndex: 'orderCode',
      key: 'orderCode',
      width: 200,
      render: (value: unknown, record) => {
        const id = String(record.id || '');
        const code = value ? String(value) : id.slice(0, 16);
        return (
          <a onClick={() => router.push(`/sales/orders/${id}`)}>
            <Typography.Text strong copyable={false}>{code}</Typography.Text>
          </a>
        );
      },
    },
    {
      title: '客户',
      dataIndex: 'leadId',
      key: 'leadId',
      width: 140,
      render: (value: unknown) => (value ? `客资 #${String(value).slice(0, 8)}` : '-'),
    },
    {
      title: '产品类型',
      dataIndex: 'serviceType',
      key: 'serviceType',
      width: 130,
      render: (value: unknown) => value ? <Tag color="blue">{String(value)}</Tag> : '-',
    },
    {
      title: '服务类型 / 保障',
      dataIndex: 'remark',
      key: 'remark',
      width: 240,
      ellipsis: true,
      render: (value: unknown) => {
        if (!value) return '-';
        const text = String(value);
        return (
          <span title={text}>
            {text.split(' || ').slice(0, 2).join(' · ')}
          </span>
        );
      },
    },
    {
      title: '付款阶段',
      dataIndex: 'remark',
      key: 'paymentStage',
      width: 140,
      render: (value: unknown) => {
        if (!value) return '-';
        const match = String(value).match(/付款: ([^|]+)/);
        return match ? <Tag color="orange">{match[1].trim()}</Tag> : '-';
      },
    },
    {
      title: '成交金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (value: unknown) => (value ? `¥ ${value}` : '-'),
    },
    {
      title: '负责教务',
      key: 'academic',
      width: 130,
      render: (_value: unknown, record) => {
        const name = record.academicUserName ? String(record.academicUserName) : '';
        const id = record.academicUserId ? String(record.academicUserId) : '';
        if (name) return <span>{name}</span>;
        if (id) return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{id.slice(0, 8)}…</Typography.Text>;
        return <Tag>待分配</Tag>;
      },
    },
    {
      title: '订单状态',
      dataIndex: 'orderStatus',
      key: 'orderStatus',
      width: 110,
      render: (value: unknown) => {
        const code = String(value || '');
        const meta = orderStatusMeta[code] || { label: code, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '成交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: unknown) => formatDateTime(value as string),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的成交</Typography.Title>
          <Typography.Paragraph type="secondary">
            只展示您已成交的订单（ORD-YYYYMMDD-XXXXX 编号），按时间倒序排列。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            value={filters.productType}
            options={PRODUCT_TYPE_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, productType: value }))}
            style={{ width: 150 }}
            placeholder="产品类型"
          />
          <Select
            value={filters.status}
            options={ORDER_STATUS_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            style={{ width: 140 }}
            placeholder="订单状态"
          />
          <DatePicker.RangePicker
            value={filters.dateRange}
            onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: (range as [Dayjs, Dayjs]) || null }))}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {items.length ? (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={false}
              scroll={{ x: 1300 }}
            />
          ) : (
            <Empty description="暂无成交记录" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
              load();
            }}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>
    </Space>
  );
}
