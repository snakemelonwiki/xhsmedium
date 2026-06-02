'use client';

import { DownloadOutlined, FileExcelOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

import {
  createExport,
  downloadExportUrl,
  listExports,
  type ExportFilter,
  type ExportStatus,
  type ExportTask,
} from '@/shared/api/exports';
import { formatDateTime } from '@/shared/utils/date-format';

const EXPORT_TYPE_LABEL: Record<string, string> = {
  orders: '订单',
  order_progress: '订单跟进',
  leads: '客资',
  collaboration_records: '协同记录',
  posts: '作品',
  rankings: '榜单',
  accounts: '账号',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '排队中', color: 'default' },
  processing: { label: '生成中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

const ORDER_STATUS_OPTIONS = [
  { label: '待领取', value: 'to_receive' },
  { label: '进行中', value: 'in_progress' },
  { label: '待客户资料', value: 'awaiting_client_info' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '异常', value: 'abnormal' },
];

const PAID_STATUS_OPTIONS = [
  { label: '未付款', value: 'unpaid' },
  { label: '部分付款', value: 'partial' },
  { label: '已付款', value: 'paid' },
];

function summarizeFilter(filter: Record<string, unknown> | undefined) {
  if (!filter || typeof filter !== 'object') return '-';
  const keys = ['status', 'paidStatus', 'orderId', 'from', 'to', 'scope'];
  const parts: string[] = [];
  for (const k of keys) {
    const v = filter[k];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}=${v}`);
  }
  return parts.length > 0 ? parts.join('，') : '无筛选';
}

export default function AcademicExportsPage() {
  const [items, setItems] = useState<ExportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportPaidStatus, setExportPaidStatus] = useState<string>('');
  const [exportRange, setExportRange] = useState<[Dayjs, Dayjs] | null>(null);
  // N-P1-08 修复：从通知 deep link ?taskId=xxx 跳过来时，记录要高亮的行。
  // 在 Table rowClassName 中按此 id 加 className，2s 后清空避免长留痕。
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightTaskId) return undefined;
    const timer = window.setTimeout(() => setHighlightTaskId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [highlightTaskId]);

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError('');
    try {
      const result = await listExports({ page: nextPage, pageSize: nextPageSize });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '导出记录加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, pageSize);
    // N-P1-08 修复：从通知 deep link 跳过来时（?taskId=xxx），
    // 高亮对应行（用 rowClassName）。这里只挂一次，后续无副作用。
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (taskId) {
      setHighlightTaskId(taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExportOrder() {
    const filter: ExportFilter = {
      scope: 'academic',
    };
    if (exportStatus) filter.status = exportStatus;
    if (exportPaidStatus) filter.paidStatus = exportPaidStatus;
    if (exportRange) {
      filter.from = exportRange[0].startOf('day').toISOString();
      filter.to = exportRange[1].endOf('day').toISOString();
    }
    setSubmitting(true);
    try {
      const result = await createExport({ exportType: 'orders', filter });
      message.success(`导出任务已创建（#${result.id.slice(0, 8)}），完成后会通知`);
      setExportModalOpen(false);
      setExportStatus('');
      setExportPaidStatus('');
      setExportRange(null);
      void load(1, pageSize);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出任务创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  function renderStatus(status: ExportStatus | string) {
    const meta = STATUS_META[String(status)] || { label: String(status || '未知'), color: 'default' };
    return <Tag color={meta.color}>{meta.label}</Tag>;
  }

  const columns: ColumnsType<ExportTask> = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      width: 110,
      render: (value: string) => <Typography.Text code>{value.slice(0, 8)}</Typography.Text>,
    },
    {
      title: '导出类型',
      dataIndex: 'exportType',
      width: 100,
      render: (value: string) => EXPORT_TYPE_LABEL[value] || value,
    },
    {
      title: '筛选',
      dataIndex: 'filter',
      render: (filter: Record<string, unknown>) => (
        <Typography.Text type="secondary">{summarizeFilter(filter)}</Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '完成时间',
      dataIndex: 'finishedAt',
      width: 170,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (_v, record) => {
        if (record.status === 'completed') {
          return (
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              href={downloadExportUrl(record.id)}
              target="_blank"
              rel="noreferrer"
            >
              下载
            </Button>
          );
        }
        if (record.status === 'failed') {
          return <Typography.Text type="danger">失败，请重试</Typography.Text>;
        }
        return <Typography.Text type="secondary">处理中…</Typography.Text>;
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>导出中心</Typography.Title>
          <Typography.Paragraph type="secondary">
            异步生成订单 / 订单跟进记录 CSV，文件生成后会在此展示，可直接下载。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => load(page, pageSize)} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<FileExcelOutlined />} onClick={() => setExportModalOpen(true)}>
            导出订单
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        <Table<ExportTask>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          // N-P1-08 修复：从通知 deep link ?taskId=xxx 跳过来时，匹配该 id 的行高亮。
          rowClassName={(record) => (highlightTaskId && record.id === highlightTaskId ? 'row-highlight' : '')}
          pagination={false}
          scroll={{ x: 920 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出记录" />,
          }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(nextPage, nextPageSize) => load(nextPage, nextPageSize)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      <Modal
        title="导出订单"
        open={exportModalOpen}
        onCancel={() => {
          if (submitting) return;
          setExportModalOpen(false);
          setExportStatus('');
          setExportPaidStatus('');
          setExportRange(null);
        }}
        onOk={handleExportOrder}
        confirmLoading={submitting}
        okText="创建导出"
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            生成完成后会发送通知（export_done），可在下方列表或消息中心查看下载链接。
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              订单状态
            </Typography.Text>
            <Select
              value={exportStatus}
              allowClear
              placeholder="全部"
              style={{ width: '100%' }}
              onChange={(v) => setExportStatus(v || '')}
              options={[{ label: '全部', value: '' }, ...ORDER_STATUS_OPTIONS]}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              付款状态
            </Typography.Text>
            <Select
              value={exportPaidStatus}
              allowClear
              placeholder="全部"
              style={{ width: '100%' }}
              onChange={(v) => setExportPaidStatus(v || '')}
              options={[{ label: '全部', value: '' }, ...PAID_STATUS_OPTIONS]}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              时间范围
            </Typography.Text>
            <DatePicker.RangePicker
              value={exportRange}
              onChange={(range) => setExportRange((range as [Dayjs, Dayjs]) || null)}
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
