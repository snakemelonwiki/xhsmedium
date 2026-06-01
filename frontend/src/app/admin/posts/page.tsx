'use client';

import { Card, Empty, Input, Pagination, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type AdminPost = {
  id: string;
  employeeId: string;
  accountId: string;
  platform: string;
  postType: string;
  title: string;
  postUrl?: string | null;
  traffic?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  publishedAt?: string;
  employeeName?: string | null;
  accountName?: string | null;
};

type Employee = { id: string; name: string };

/**
 * 主管端作品看板：跨员工聚合作品列表，支持员工 / 平台 / 关键字筛选。
 */
export default function AdminPostsPage() {
  const [items, setItems] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>();
  const [platform, setPlatform] = useState<string>();
  const [keyword, setKeyword] = useState('');

  async function load(nextPage = page, nextPageSize = pageSize, eId = employeeId, pf = platform, kw = keyword) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (eId) query.employeeId = eId;
      if (pf) query.platform = pf;
      if (kw) query.search = kw;
      const payload = await apiClient.get<any>('/posts', { query });
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

  async function loadEmployees() {
    try {
      const payload = await apiClient.get<any>('/employees');
      const data = payload?.items ?? payload ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    }
  }

  useEffect(() => {
    void loadEmployees();
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<AdminPost> = [
    { title: '员工', dataIndex: 'employeeName', render: (v, r) => v || r.employeeId },
    { title: '账号', dataIndex: 'accountName', render: (v, r) => v || r.accountId },
    { title: '平台', dataIndex: 'platform', width: 80 },
    { title: '类型', dataIndex: 'postType', width: 90 },
    { title: '标题', dataIndex: 'title', render: (v, r) => r.postUrl ? <a href={r.postUrl} target="_blank" rel="noreferrer">{v}</a> : v },
    { title: '流量', dataIndex: 'traffic', width: 80 },
    { title: '赞', dataIndex: 'likes', width: 70 },
    { title: '评', dataIndex: 'comments', width: 70 },
    { title: '藏', dataIndex: 'favorites', width: 70 },
    { title: '发布日', dataIndex: 'publishedAt', width: 110 },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>作品看板</Typography.Title>
        <Typography.Paragraph type="secondary">查看跨员工的作品聚合数据。</Typography.Paragraph>
      </div>
      <Card>
        <Space size={12} wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="选择员工"
            style={{ width: 180 }}
            value={employeeId}
            onChange={(v) => { setEmployeeId(v); void load(1, pageSize, v, platform, keyword); }}
            options={employees.map((e) => ({ label: e.name || e.id, value: e.id }))}
          />
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 120 }}
            value={platform}
            onChange={(v) => { setPlatform(v); void load(1, pageSize, employeeId, v, keyword); }}
            options={[{ label: '小红书', value: '小红书' }, { label: '抖音', value: '抖音' }]}
          />
          <Input.Search
            allowClear
            placeholder="搜索标题/文案"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => load(1, pageSize, employeeId, platform, v)}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
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
