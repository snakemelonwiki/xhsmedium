'use client';

import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  InputNumber,
  Modal,
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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listMyDeals } from '@/shared/api/leads';
import { getOrderDelivery, updateOrder } from '@/shared/api/orders';
import { formatDateTime } from '@/shared/utils/date-format';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { buildTodayDateRange } from '@/shared/utils/default-date-range';
import {
  buildSalesDealStatusFilter,
  formatSalesDealDateParam,
  normalizePaymentStatus,
  pickClientPaidValue,
} from './dealsFilters';

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
  { label: '已补客户资料', value: 'client_info_completed' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '已分配老师', value: 'teacher_assigned' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '已关闭', value: 'closed' },
  { label: '异常', value: 'abnormal' },
];

const orderStatusMeta: Record<string, { label: string; color: string }> = {
  to_receive: { label: '待领取', color: 'orange' },
  in_progress: { label: '进行中', color: 'blue' },
  awaiting_client_info: { label: '待客户资料', color: 'gold' },
  client_info_completed: { label: '已补客户资料', color: 'green' },
  awaiting_teacher: { label: '待老师', color: 'purple' },
  teacher_assigned: { label: '已分配老师', color: 'green' },
  to_deliver: { label: '待交付', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
  abnormal: { label: '异常', color: 'red' },
};

type Filters = {
  status: string;
  productType: string;
  dateRange: DateRangeValue;
};

type PaymentFormValues = {
  paidStatus: 'partial' | 'paid';
  paymentStage: string;
  clientPaid: number | string;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  productType: '',
  dateRange: null,
};

function buildDefaultFilters(): Filters {
  return { ...EMPTY_FILTERS, dateRange: buildTodayDateRange() };
}

export default function SalesDealsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [filters, setFilters] = useState<Filters>(() => buildDefaultFilters());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState<Record<string, unknown> | null>(null);
  const [paymentForm] = Form.useForm<PaymentFormValues>();
  const [updatingPayment, setUpdatingPayment] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // "我的成交"需覆盖销售仍要跟进收款/交付的订单状态，避免刚成交订单消失。
      // 数组传参会展开成多个 status 查询参数（apiClient 已支持）。
      const result = await listMyDeals({
        status: buildSalesDealStatusFilter(filters.status),
        productType: filters.productType || undefined,
        startDate: filters.dateRange ? formatSalesDealDateParam(filters.dateRange.start, 'start') : undefined,
        endDate: filters.dateRange ? formatSalesDealDateParam(filters.dateRange.end, 'end') : undefined,
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
    setPage(1);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.status,
    filters.productType,
    filters.dateRange?.start.valueOf(),
    filters.dateRange?.end.valueOf(),
    page,
    pageSize,
  ]);

  async function openPayment(record: Record<string, unknown>) {
    setPaymentOpen(record);
    const fallbackClientPaid = record.clientPaid as number | string | null | undefined;
    paymentForm.setFieldsValue({
      paidStatus: normalizePaymentStatus(record.paidStatus),
      paymentStage: String(record.paymentStage || parsePaymentStage(record.remark) || '定金'),
      clientPaid: pickClientPaidValue(undefined, fallbackClientPaid),
    });
    try {
      const delivery = await getOrderDelivery(String(record.id));
      paymentForm.setFieldsValue({
        clientPaid: pickClientPaidValue(delivery.finance.customerPaid, fallbackClientPaid),
      });
    } catch {
      message.warning('付款详情加载失败，已保留列表中的付款金额');
    }
  }

  async function submitPayment() {
    if (!paymentOpen) return;
    const values = await paymentForm.validateFields().catch(() => null);
    if (!values) return;
    setUpdatingPayment(true);
    try {
      await updateOrder(String(paymentOpen.id), {
        paid_status: values.paidStatus,
        payment_stage: values.paymentStage,
        client_paid: values.clientPaid,
      });
      message.success('付款信息已更新');
      setPaymentOpen(null);
      paymentForm.resetFields();
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '付款信息更新失败');
    } finally {
      setUpdatingPayment(false);
    }
  }

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
      render: (value: unknown, record) => {
        const stage = String(record.paymentStage || parsePaymentStage(value) || '');
        return stage ? <Tag color="orange">{stage}</Tag> : '-';
      },
    },
    {
      title: '成交金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (value: unknown) => {
        // v1.3 / BF-09 close-deal-amount: 成交金额必填且 > 0。
        // 历史脏数据可能为 0 / null / '' / undefined，统一展示「未填写」+ 红色警告，
        // 提示销售手动补录（不自动填充，避免误判金额）。
        if (value === null || value === undefined || value === '' || Number(value) === 0) {
          return <Typography.Text type="danger">未填写</Typography.Text>;
        }
        return `¥ ${value}`;
      },
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
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 110,
      render: (_value: unknown, record) => (
        <Button size="small" onClick={() => openPayment(record)}>
          更新付款
        </Button>
      ),
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
          <QuickRangePicker
            value={filters.dateRange}
            onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range ?? buildTodayDateRange() }))}
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
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">共 {total} 条</Typography.Text>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              onChange={(nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              }}
            />
          </div>
        </Card>
      </Spin>
      <Modal
        title="更新付款信息"
        open={Boolean(paymentOpen)}
        onCancel={() => setPaymentOpen(null)}
        onOk={submitPayment}
        confirmLoading={updatingPayment}
        destroyOnClose
      >
        <Form<PaymentFormValues> form={paymentForm} layout="vertical" preserve={false}>
          <Form.Item name="paidStatus" label="付款状态" rules={[{ required: true, message: '请选择付款状态' }]}>
            <Select
              options={[
                { label: '部分付款', value: 'partial' },
                { label: '已付款', value: 'paid' },
              ]}
            />
          </Form.Item>
          <Form.Item name="paymentStage" label="付款阶段" rules={[{ required: true, message: '请选择付款阶段' }]}>
            <Select
              options={[
                { label: '定金', value: '定金' },
                { label: '中期', value: '中期' },
                { label: '尾款', value: '尾款' },
                { label: '全款', value: '全款' },
              ]}
            />
          </Form.Item>
          <Form.Item name="clientPaid" label="付款金额（元）" rules={[{ required: true, message: '请输入付款金额' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function parsePaymentStage(value: unknown): string {
  if (!value) return '';
  const match = String(value).match(/付款: ([^|]+)/);
  return match ? match[1].trim() : '';
}
