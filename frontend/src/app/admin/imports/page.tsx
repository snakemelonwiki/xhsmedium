'use client';

import { Card, Empty, Pagination, Radio, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type ImportTask = {
  id: string;
  importType: string;
  userId: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  status: string;
  errorFileUrl?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  processing: 'blue',
  done: 'green',
  failed: 'red',
};

/**
 * 主管端导入历史：展示全部用户的客资/作品批量导入记录，含成功/失败统计与错误文件下载。
 */
export default function AdminImportsPage() {
  const [items, setItems] = useState<ImportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<string>('');

  async function load(nextPage = page, nextPageSize = pageSize, t = type) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (t) query.type = t;
      const payload = await apiClient.get<any>('/import-tasks', { query });
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

  const columns: ColumnsType<ImportTask> = [
    { title: '导入类型', dataIndex: 'importType', width: 100 },
    { title: '发起人', dataIndex: 'userId', width: 140, ellipsis: true },
    { title: '总行数', dataIndex: 'totalCount', width: 90 },
    { title: '成功', dataIndex: 'successCount', width: 80 },
    { title: '失败', dataIndex: 'failCount', width: 80 },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag> },
    {
      title: '错误文件',
      dataIndex: 'errorFileUrl',
      width: 110,
      render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">下载</a> : '-',
    },
    { title: '开始时间', dataIndex: 'createdAt', width: 170 },
    { title: '完成时间', dataIndex: 'finishedAt', width: 170, render: (v) => v || '-' },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>导入记录</Typography.Title>
        <Typography.Paragraph type="secondary">查看客资/作品批量导入历史与失败明细。</Typography.Paragraph>
      </div>
      <Card>
        <Radio.Group
          value={type}
          style={{ marginBottom: 16 }}
          onChange={(e) => { setType(e.target.value); void load(1, pageSize, e.target.value); }}
        >
          <Radio.Button value="">全部</Radio.Button>
          <Radio.Button value="leads">客资</Radio.Button>
          <Radio.Button value="posts">作品</Radio.Button>
        </Radio.Group>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无导入记录" /> }}
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
