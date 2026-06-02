'use client';

import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { DownloadOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, message, Select, Space, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createExport } from '@/shared/api/exports';
import { listSalesLeads } from '@/shared/api/leads';
import { StatusTag } from '@/shared/components/status';
import type { SalesLead } from '@/shared/types/leads';

import { buildOperationLeadsExportFilter } from './exportFilter';

type LeadFilters = {
  platform?: string;
  status?: string;
  search?: string;
};

export default function OperationLeadsPage() {
  const [items, setItems] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  async function load(nextPage = pagination.current, nextPageSize = pagination.pageSize, nextFilters = filters) {
    setLoading(true);
    try {
      const result = await listSalesLeads({
        scope: 'self',
        page: nextPage,
        pageSize: nextPageSize,
        platform: nextFilters.platform,
        status: nextFilters.status,
        search: nextFilters.search,
      });
      setItems(result.items);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      await createExport({
        exportType: 'leads',
        filter: buildOperationLeadsExportFilter({
          page: pagination.current,
          pageSize: pagination.pageSize,
          ...filters,
        }),
      });
      message.success('已创建客资导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资导出创建失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>运营客资看板</Typography.Title>
          <Typography.Paragraph type="secondary">回看自己录入客资的分配、添加、跟进和协同状态。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            allowClear
            aria-label="筛选平台"
            placeholder="全部平台"
            style={{ width: 140 }}
            value={filters.platform}
            options={[
              { label: '小红书', value: 'xiaohongshu' },
              { label: '抖音', value: 'douyin' },
            ]}
            onChange={(platform) => {
              const next = { ...filters, platform };
              setFilters(next);
              load(1, pagination.pageSize, next);
            }}
          />
          <Select
            allowClear
            aria-label="筛选状态"
            placeholder="全部状态"
            style={{ width: 160 }}
            value={filters.status}
            options={[
              { label: '新客资', value: 'new' },
              { label: '已分配', value: 'assigned' },
              { label: '协同中', value: 'in_collaboration' },
              { label: '运营已处理', value: 'operation_handled' },
              { label: '已添加通过', value: 'added_success' },
              { label: '无效客资', value: 'invalid' },
            ]}
            onChange={(status) => {
              const next = { ...filters, status };
              setFilters(next);
              load(1, pagination.pageSize, next);
            }}
          />
          <Input.Search
            allowClear
            placeholder="搜索客户/联系方式"
            style={{ width: 220 }}
            onSearch={(search) => {
              const next = { ...filters, search };
              setFilters(next);
              load(1, pagination.pageSize, next);
            }}
          />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出当前筛选
          </Button>
          <Button onClick={() => load()}>刷新</Button>
          <Link href="/operation/leads/new"><Button type="primary">录入客资</Button></Link>
        </Space>
      </div>
      <Card>
        <ProTable<SalesLead>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={(next: TablePaginationConfig) => load(next.current ?? 1, next.pageSize ?? 20)}
          locale={{ emptyText: <Empty description="暂无客资" /> }}
          search={false}
          options={false}
        />
      </Card>
    </Space>
  );
}

const columns: ProColumns<SalesLead>[] = [
  {
    title: '客户',
    dataIndex: 'customerName',
    sorter: (a, b) => String(a.customerName || '').localeCompare(String(b.customerName || '')),
    render: (_, record) => (
      <Space direction="vertical" size={2}>
        <Typography.Text strong>{record.customerName || record.nickname || `客资 ${record.id}`}</Typography.Text>
        <Typography.Text type="secondary">{record.contact || record.phone || record.wechat || '-'}</Typography.Text>
      </Space>
    ),
  },
  {
    title: '来源账号',
    render: (_, record) => record.source?.accountName || record.source?.accountId || '-',
  },
  {
    title: '来源作品',
    render: (_, record) => record.source?.postTitle || record.source?.postId || '-',
  },
  {
    title: '分配销售',
    render: (_, record) => record.sales?.name || record.sales?.id || '-',
  },
  {
    title: '添加状态',
    render: (_, record) => <StatusTag kind="addStatus" code={record.addStatus} />,
  },
  {
    title: '协同状态',
    render: (_, record) => <StatusTag kind="collaborationStatus" code={record.collaborationStatus} />,
  },
  {
    title: '客资状态',
    render: (_, record) => <StatusTag kind="leadStatus" code={record.status} />,
  },
  {
    title: '最后更新',
    sorter: (a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')),
    render: (_, record) => record.updatedAt || record.latestFollowAt || record.assignedAt || '-',
  },
];
