'use client';

import { DownloadOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Segmented, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';

import {
  createExportTask,
  exportDownloadUrl,
  listExportTasks,
  type ExportTask,
  type ExportType,
} from '@/shared/api/exports';
import { formatDateTime } from '@/shared/utils/date-format';

const TYPE_LABEL: Record<ExportType, string> = {
  posts: '作品',
  leads: '客资',
  rankings: '排行榜',
  orders: '订单',
  order_progress: '订单跟进',
  collaboration_records: '协同记录',
  accounts: '账号',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '排队中', color: 'default' },
  processing: { label: '生成中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  success: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
};

type ExportCenterPageProps = {
  title: string;
  description: string;
  types: ExportType[];
};

/**
 * 多端共享导出中心，按传入类型限制可创建的导出任务。
 */
export function ExportCenterPage({ title, description, types }: ExportCenterPageProps) {
  const [items, setItems] = useState<ExportTask[]>([]);
  const [selectedType, setSelectedType] = useState<ExportType>(types[0]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [messageApi, contextHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listExportTasks({ page: 1, pageSize: 20 });
      setItems(result.items);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : '导出任务加载失败');
    } finally {
      setLoading(false);
    }
  }

  /**
   * 创建当前选中类型的导出任务，并刷新任务列表。
   */
  async function submitExport() {
    setSubmitting(true);
    try {
      await createExportTask(selectedType, {});
      await messageApi.success('导出任务已创建');
      await load();
    } catch (err) {
      await messageApi.error(err instanceof Error ? err.message : '导出任务创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const options = useMemo(
    () => types.map((type) => ({ label: TYPE_LABEL[type], value: type })),
    [types],
  );

  const columns: ColumnsType<ExportTask> = [
    {
      title: '类型',
      dataIndex: 'exportType',
      render: (value: ExportType | string) => TYPE_LABEL[value as ExportType] ?? value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => {
        const meta = STATUS_META[value] || { label: value || '未知', color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: formatDateTime,
    },
    {
      title: '完成时间',
      dataIndex: 'finishedAt',
      render: formatDateTime,
    },
    {
      title: '操作',
      width: 120,
      render: (_, row) => (
        <Button
          icon={<DownloadOutlined />}
          href={exportDownloadUrl(row.id)}
          disabled={!row.fileUrl || !['completed', 'success'].includes(row.status)}
          target="_blank"
          rel="noreferrer"
        >
          下载
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {contextHolder}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={selectedType}
            options={options}
            onChange={(value) => setSelectedType(value as ExportType)}
          />
          <Button type="primary" icon={<ExportOutlined />} loading={submitting} onClick={submitExport}>
            创建导出
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message="导出中心暂不可用" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出任务" /> }}
          scroll={{ x: 760 }}
        />
      </Card>
    </Space>
  );
}
