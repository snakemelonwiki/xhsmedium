'use client';

import { Card, Empty, Pagination, Radio, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type CollabTask = {
  id: string;
  leadId: string;
  type: string;
  status: 'pending' | 'handling' | 'handled' | 'closed' | string;
  requesterId?: string;
  handlerId?: string | null;
  reason?: string | null;
  handledNote?: string | null;
  customerName?: string | null;
  contactInfo?: string | null;
  requestedAt?: string;
  handledAt?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  remind_customer: '提醒添加',
  supplement_info: '补充信息',
  verify_identity: '核身',
  second_touch: '二次跟进',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  handling: 'blue',
  handled: 'green',
  closed: 'default',
};

/**
 * 主管端协同处理：默认 scope=all 全表，配合状态筛选用于稽核全平台协同进展。
 */
export default function AdminCollaborationPage() {
  const [items, setItems] = useState<CollabTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  async function load(nextPage = page, nextPageSize = pageSize, st = status) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        scope: 'all',
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (st) query.status = st;
      const payload = await apiClient.get<any>('/collaboration-tasks', { query });
      const data = payload?.items ?? payload ?? [];
      const totalCount = payload?.total ?? data.length;
      setItems(Array.isArray(data) ? data : []);
      setTotal(totalCount);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<CollabTask> = [
    { title: '客资', render: (_, r) => r.customerName || r.contactInfo || r.leadId.slice(0, 8) },
    { title: '类型', dataIndex: 'type', width: 110, render: (v) => TYPE_LABELS[v] || v },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag> },
    { title: '发起人', dataIndex: 'requesterId', width: 130, ellipsis: true },
    { title: '处理人', dataIndex: 'handlerId', width: 130, ellipsis: true, render: (v) => v || '-' },
    { title: '原因', dataIndex: 'reason', ellipsis: true, render: (v) => v || '-' },
    { title: '处理备注', dataIndex: 'handledNote', ellipsis: true, render: (v) => v || '-' },
    { title: '发起时间', dataIndex: 'requestedAt', width: 170 },
    { title: '处理时间', dataIndex: 'handledAt', width: 170, render: (v) => v || '-' },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>协同处理</Typography.Title>
        <Typography.Paragraph type="secondary">全平台协同任务总览，按状态筛选。</Typography.Paragraph>
      </div>
      <Card>
        <Radio.Group
          value={status}
          style={{ marginBottom: 16 }}
          onChange={(e) => { setStatus(e.target.value); void load(1, pageSize, e.target.value); }}
        >
          <Radio.Button value="">全部</Radio.Button>
          <Radio.Button value="pending">待处理</Radio.Button>
          <Radio.Button value="handling">处理中</Radio.Button>
          <Radio.Button value="handled">已处理</Radio.Button>
          <Radio.Button value="closed">已关闭</Radio.Button>
        </Radio.Group>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无协同任务" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(p, ps) => load(p, ps)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>
    </Space>
  );
}
