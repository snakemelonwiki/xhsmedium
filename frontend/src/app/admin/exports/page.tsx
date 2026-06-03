'use client';

import { CheckOutlined, DownloadOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Pagination,
  Select,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  downloadExportUrl,
  getExport,
  listExportTasks,
  type ExportTask,
  type ExportType,
} from '@/shared/api/exports';
import { formatDateTime } from '@/shared/utils/date-format';

const { RangePicker } = DatePicker;
const PAGE_SIZE = 20;
const AUTO_REFRESH_INTERVAL = 5000; // 5 秒自动刷新

// 导出类型配置
const TYPE_LABEL: Record<ExportType | string, string> = {
  posts: '作品',
  leads: '客资',
  rankings: '排行榜',
  orders: '订单',
  order_progress: '订单跟进',
  collaboration_records: '协同记录',
  accounts: '账号',
};

// 状态配置
const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'blue' },
  processing: { label: '处理中', color: 'orange' },
  completed: { label: '成功', color: 'green' },
  success: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

// 可用的导出类型
const AVAILABLE_TYPES: ExportType[] = [
  'posts',
  'leads',
  'rankings',
  'orders',
  'collaboration_records',
  'accounts',
];

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

export default function AdminExportsPage() {
  const [items, setItems] = useState<ExportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ExportType | 'all'>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedTask, setSelectedTask] = useState<ExportTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const autoRefreshTimerRef = useRef<number | null>(null);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError(undefined);
    try {
      const query: Record<string, string | number> = {
        page: nextPage,
        pageSize: PAGE_SIZE,
      };

      // 添加状态筛选
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      // 添加类型筛选
      if (typeFilter !== 'all') {
        query.type = typeFilter;
      }

      // 添加时间筛选
      if (dateRange && dateRange[0] && dateRange[1]) {
        query.from = dateRange[0].format('YYYY-MM-DD');
        query.to = dateRange[1].format('YYYY-MM-DD');
      }

      const result = await listExportTasks(query);
      setItems(result.items);
      setTotal(result.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出任务加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, dateRange]);

  // 处理中和待处理状态自动刷新
  useEffect(() => {
    const hasPendingOrProcessing = items.some((item) =>
      ['pending', 'processing'].includes(item.status),
    );

    if (hasPendingOrProcessing) {
      autoRefreshTimerRef.current = window.setInterval(() => {
        void load(page);
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        window.clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [items, load, page]);

  // 状态或类型变化时重置页码并重新加载
  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    void load(1);
  };

  const handleTypeChange = (value: ExportType | 'all') => {
    setTypeFilter(value);
    setPage(1);
    void load(1);
  };

  const handleDateChange = (value: [Dayjs | null, Dayjs | null] | null) => {
    setDateRange(value);
    setPage(1);
    void load(1);
  };

  async function openDetail(row: ExportTask) {
    setSelectedTask(row);
    setTaskLoading(true);
    try {
      const detail = await getExport(row.id);
      setSelectedTask(detail);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '详情加载失败');
    } finally {
      setTaskLoading(false);
    }
  }

  function handleDownload(row: ExportTask) {
    const url = downloadExportUrl(row.id);
    window.open(url, '_blank');
  }

  const columns: ColumnsType<ExportTask> = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'exportType',
        width: 120,
        render: (value: ExportType | string) => TYPE_LABEL[value] ?? value,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (value: string) => {
          const meta = STATUS_META[value] || { label: value || '未知', color: 'default' };
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      {
        title: '提交时间',
        dataIndex: 'createdAt',
        width: 160,
        render: formatDateTime,
      },
      {
        title: '开始时间',
        dataIndex: 'updatedAt',
        width: 160,
        render: formatDateTime,
      },
      {
        title: '完成时间',
        dataIndex: 'finishedAt',
        width: 160,
        render: formatDateTime,
      },
      {
        title: '操作',
        width: 140,
        fixed: 'right' as const,
        render: (_, row) => (
          <Space size={4}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetail(row)}
            >
              详情
            </Button>
            {['completed', 'success'].includes(row.status) && row.fileUrl && (
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => handleDownload(row)}
              >
                下载
              </Button>
            )}
          </Space>
        ),
      },
    ],
    [],
  );

  const typeOptions = useMemo(
    () => [
      { label: '全部类型', value: 'all' },
      ...AVAILABLE_TYPES.map((t) => ({ label: TYPE_LABEL[t], value: t })),
    ],
    [],
  );

  const statusOptions: { label: string; value: StatusFilter }[] = [
    { label: '全部', value: 'all' },
    { label: '待处理', value: 'pending' },
    { label: '处理中', value: 'processing' },
    { label: '成功', value: 'completed' },
    { label: '失败', value: 'failed' },
  ];

  const hasActiveTasks = items.some((item) =>
    ['pending', 'processing'].includes(item.status),
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>导出中心</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看并下载导出任务。{hasActiveTasks && <Tag color="orange">正在处理中...</Tag>}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={statusFilter}
            onChange={(value) => handleStatusChange(value as StatusFilter)}
            options={statusOptions}
          />
          <Select<ExportType | 'all'>
            value={typeFilter}
            onChange={handleTypeChange}
            options={typeOptions}
            style={{ width: 120 }}
            placeholder="导出类型"
          />
          <RangePicker
            value={dateRange}
            onChange={handleDateChange}
            allowClear
            placeholder={['开始日期', '结束日期']}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load()}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="导出中心暂不可用" description={error} />
      ) : null}

      <Card>
        <Table<ExportTask>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出任务" /> }}
        />
        <Pagination
          current={page}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={(p) => void load(p)}
          style={{ marginTop: 16, textAlign: 'right' }}
          showSizeChanger={false}
          showTotal={(t) => `共 ${t} 条`}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="导出任务详情"
        open={Boolean(selectedTask)}
        onCancel={() => setSelectedTask(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedTask(null)}>
            关闭
          </Button>,
          selectedTask && ['completed', 'success'].includes(selectedTask.status) && selectedTask.fileUrl ? (
            <Button
              key="download"
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => {
                if (selectedTask) handleDownload(selectedTask);
              }}
            >
              下载文件
            </Button>
          ) : null,
        ].filter(Boolean)}
        width={600}
      >
        <Spin spinning={taskLoading}>
          {selectedTask && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Space size={24} wrap>
                <div>
                  <Typography.Text type="secondary">任务ID</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }} copyable>
                    {selectedTask.id}
                  </Typography.Paragraph>
                </div>
                <div>
                  <Typography.Text type="secondary">导出类型</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }}>
                    {TYPE_LABEL[selectedTask.exportType] ?? selectedTask.exportType}
                  </Typography.Paragraph>
                </div>
              </Space>

              <Space size={24} wrap>
                <div>
                  <Typography.Text type="secondary">状态</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }}>
                    {(() => {
                      const meta = STATUS_META[selectedTask.status] || {
                        label: selectedTask.status || '未知',
                        color: 'default',
                      };
                      return <Tag color={meta.color}>{meta.label}</Tag>;
                    })()}
                  </Typography.Paragraph>
                </div>
                <div>
                  <Typography.Text type="secondary">提交时间</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }}>
                    {formatDateTime(selectedTask.createdAt)}
                  </Typography.Paragraph>
                </div>
                <div>
                  <Typography.Text type="secondary">完成时间</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }}>
                    {formatDateTime(selectedTask.finishedAt) || '-'}
                  </Typography.Paragraph>
                </div>
              </Space>

              {selectedTask.fileUrl && (
                <div>
                  <Typography.Text type="secondary">文件地址</Typography.Text>
                  <Typography.Paragraph style={{ margin: 0 }} copyable>
                    {selectedTask.fileUrl}
                  </Typography.Paragraph>
                </div>
              )}

              {selectedTask.filter && Object.keys(selectedTask.filter).length > 0 && (
                <div>
                  <Typography.Text type="secondary">筛选条件</Typography.Text>
                  <Card size="small" style={{ marginTop: 8 }}>
                    <Space direction="vertical" size={4}>
                      {Object.entries(selectedTask.filter).map(([key, value]) => (
                        <Typography.Text key={key} type="secondary">
                          {key}: {String(value ?? '-')}
                        </Typography.Text>
                      ))}
                    </Space>
                  </Card>
                </div>
              )}
            </Space>
          )}
        </Spin>
      </Modal>
    </Space>
  );
}
