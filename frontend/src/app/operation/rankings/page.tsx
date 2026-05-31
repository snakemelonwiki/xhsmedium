'use client';

import { Alert, Card, Empty, Pagination, Radio, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { listRankings } from '@/shared/api/content';
import type { RankingRow } from '@/shared/types/content';

type RankingType = 'posts' | 'leads';

export default function OperationRankingsPage() {
  const [items, setItems] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RankingType>('posts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 20;

  async function load(nextPage = page, nextType = type) {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listRankings(nextType, { page: nextPage, pageSize });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '排行榜加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(nextType: RankingType) {
    setType(nextType);
    load(1, nextType);
  }

  const columns: ColumnsType<RankingRow> = [
    {
      title: '排名',
      width: 80,
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: '员工',
      dataIndex: 'name',
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: '作品数',
      dataIndex: type === 'posts' ? 'postCount' : 'todayPosts',
      sorter: (a, b) => (a.postCount || a.todayPosts) - (b.postCount || b.todayPosts),
    },
    {
      title: '获客数',
      dataIndex: type === 'leads' ? 'leadCount' : 'todayLeads',
      sorter: (a, b) => (a.leadCount || a.todayLeads) - (b.leadCount || b.todayLeads),
    },
    {
      title: '今日流量',
      dataIndex: 'todayTraffic',
    },
    {
      title: '今日成交',
      dataIndex: 'todayDeals',
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>排行榜</Typography.Title>
          <Typography.Paragraph type="secondary">查看员工、作品和获客表现榜单。</Typography.Paragraph>
        </div>
        <Radio.Group value={type} onChange={(event) => changeType(event.target.value)}>
          <Radio.Button value="posts">作品榜</Radio.Button>
          <Radio.Button value="leads">获客榜</Radio.Button>
        </Radio.Group>
      </div>
      {error ? <Alert type="warning" showIcon message="排行榜暂不可用" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无榜单数据" /> }}
        />
        <Pagination current={page} pageSize={pageSize} total={total} onChange={(nextPage) => load(nextPage)} style={{ marginTop: 16, textAlign: 'right' }} />
      </Card>
    </Space>
  );
}
