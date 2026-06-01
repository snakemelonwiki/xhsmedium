'use client';

import { Card, Empty, Input, Pagination, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type Account = {
  id: string;
  employeeId: string;
  platform: string;
  accountName: string;
  accountUid?: string | null;
  profileUrl?: string | null;
  persona?: string | null;
  positioning?: string | null;
  postingPlan?: string | null;
  status?: string;
};

/**
 * 运营端账号管理：只读列表（增删改在主管端做），支持平台 + 关键字筛选。
 * 1.2 文档把"账号管理"列入运营端范围，但目前后端 accounts 接口已就绪，前端只缺入口。
 */
export default function OperationAccountsPage() {
  const [items, setItems] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<string>();
  const [keyword, setKeyword] = useState('');

  async function load(nextPage = page, nextPageSize = pageSize, pf = platform, kw = keyword) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (pf) query.platform = pf;
      if (kw) query.search = kw;
      const payload = await apiClient.get<any>('/accounts', { query });
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

  const columns: ColumnsType<Account> = [
    { title: '账号名', dataIndex: 'accountName', render: (v, r) => r.profileUrl ? <a href={r.profileUrl} target="_blank" rel="noreferrer">{v}</a> : v },
    { title: '平台', dataIndex: 'platform', width: 100 },
    { title: 'UID', dataIndex: 'accountUid', width: 140, ellipsis: true, render: (v) => v || '-' },
    { title: '人设', dataIndex: 'persona', ellipsis: true, render: (v) => v || '-' },
    { title: '定位', dataIndex: 'positioning', ellipsis: true, render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={v === '正常' ? 'green' : 'default'}>{v || '-'}</Tag> },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>账号管理</Typography.Title>
        <Typography.Paragraph type="secondary">查看运营账号、平台和定位信息。新增/编辑请联系主管。</Typography.Paragraph>
      </div>
      <Card>
        <Space size={12} wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 120 }}
            value={platform}
            onChange={(v) => { setPlatform(v); void load(1, pageSize, v, keyword); }}
            options={[{ label: '小红书', value: '小红书' }, { label: '抖音', value: '抖音' }]}
          />
          <Input.Search
            allowClear
            placeholder="搜索账号名 / UID"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => load(1, pageSize, platform, v)}
          />
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无账号" /> }}
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
