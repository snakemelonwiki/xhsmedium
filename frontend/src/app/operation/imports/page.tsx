'use client';

import { Alert, Button, Card, Empty, Pagination, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listImportTasks } from '@/shared/api/content';
import type { ImportTask } from '@/shared/types/content';

const statusColor: Record<string, string> = {
  processing: 'processing',
  success: 'success',
  failed: 'error',
  partial_success: 'warning',
};

export default function OperationImportsPage() {
  const [items, setItems] = useState<ImportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // N-P1-08 修复：从通知 deep link ?taskId=xxx 跳过来时，记录要高亮的行。
  // 在 Table rowClassName 中按此 id 加 className，2s 后清空避免长留痕。
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightTaskId) return undefined;
    const timer = window.setTimeout(() => setHighlightTaskId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [highlightTaskId]);
  const pageSize = 20;

  async function load(nextPage = page) {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listImportTasks({ page: nextPage, pageSize });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '导入记录加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // N-P1-08 修复：从通知 deep link 跳过来时（?taskId=xxx），高亮对应行。
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (taskId) {
      setHighlightTaskId(taskId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<ImportTask> = [
    {
      title: '任务',
      dataIndex: 'id',
      render: (id: string, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{id}</Typography.Text>
          <Typography.Text type="secondary">{record.importType}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (status: string) => <Tag color={statusColor[status] || 'default'}>{status}</Tag>,
    },
    {
      title: '数量',
      width: 220,
      render: (_, record) => (
        <Space wrap>
          <Tag>总 {record.totalCount}</Tag>
          <Tag color="success">成功 {record.successCount}</Tag>
          <Tag color={record.failCount ? 'error' : 'default'}>失败 {record.failCount}</Tag>
        </Space>
      ),
    },
    {
      title: '时间',
      width: 180,
      render: (_, record) => record.finishedAt || record.createdAt || '-',
    },
    {
      title: '错误文件',
      width: 130,
      render: (_, record) => record.errorFileUrl ? <a href={record.errorFileUrl} target="_blank">下载</a> : '-',
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>导入记录</Typography.Title>
          <Typography.Paragraph type="secondary">查看作品和客资批量导入进度，下载失败明细后修正重试。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Link href="/operation/posts/new"><Button type="primary">录入作品</Button></Link>
          <Link href="/operation/leads/new"><Button>录入客资</Button></Link>
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message="导入记录暂不可用" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          // N-P1-08 修复：从通知 deep link ?taskId=xxx 跳过来时，匹配该 id 的行高亮。
          rowClassName={(record) => (highlightTaskId && record.id === highlightTaskId ? 'row-highlight' : '')}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无导入任务" /> }}
        />
        <Pagination current={page} pageSize={pageSize} total={total} onChange={load} style={{ marginTop: 16, textAlign: 'right' }} />
      </Card>
    </Space>
  );
}
