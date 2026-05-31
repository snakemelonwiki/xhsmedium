'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';

import { listAdminLeads } from '@/shared/api/admin';
import { getStatusMeta } from '@/shared/constants/status';
import type { AdminLead } from '@/shared/types/admin';

const DEFAULT_PAGE_SIZE = 20;

function formatDate(value?: string): string {
  if (!value) return '-';
  return value.slice(0, 10);
}

export default function AdminLeadsPage() {
  const [rows, setRows] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });

  const loadData = (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    setError(false);
    listAdminLeads({ page, pageSize })
      .then((result) => {
        setRows(result.items);
        setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
      })
      .catch(() => {
        setRows([]);
        setPagination((current) => ({ ...current, total: 0 }));
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(1, DEFAULT_PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: TableColumnsType<AdminLead> = [
    { title: '客户', dataIndex: 'customerName', key: 'customerName', render: (value: string) => value || '未命名客户' },
    { title: '联系方式', dataIndex: 'contact', key: 'contact', render: (value?: string) => value || '-' },
    { title: '平台', dataIndex: 'platform', key: 'platform', render: (value?: string) => value || '-' },
    { title: '运营', dataIndex: 'operatorName', key: 'operatorName', render: (value?: string) => value || '-' },
    { title: '销售', dataIndex: 'salesName', key: 'salesName', render: (value?: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => {
        const meta = getStatusMeta('leadStatus', value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '跟进',
      dataIndex: 'processStatus',
      key: 'processStatus',
      render: (value?: string) => {
        const meta = getStatusMeta('processStatus', value);
        return value ? <Tag color={meta.color}>{meta.label}</Tag> : '-';
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
  ];

  const handleTableChange = (next: TablePaginationConfig) => {
    loadData(next.current ?? 1, next.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管客资</Typography.Title>
          <Typography.Paragraph type="secondary">查看全部客资、销售归属和跟进状态。</Typography.Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
          刷新
        </Button>
      </div>
      <Card>
        <Table<AdminLead>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description={error ? '客资加载失败' : '暂无客资'} /> }}
        />
      </Card>
    </Space>
  );
}
