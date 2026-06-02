'use client';

import { Alert, Card, Empty, Pagination, Radio, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listRankings } from '@/shared/api/content';
import type { ContentPost, RankingRow } from '@/shared/types/content';

type RankingType = 'posts' | 'leads' | 'traffic' | 'learning';
type Period = '7d' | '14d' | '30d';

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLearningPost(raw: Record<string, unknown>): ContentPost {
  const leadsCount = numberValue(raw.leadsCount ?? raw.leadCount ?? raw.leads_count);
  return {
    id: text(raw.id) ?? '',
    platform: text(raw.platform) ?? '未知平台',
    title: text(raw.title) ?? '未命名作品',
    copywriting: text(raw.copywriting),
    accountId: text(raw.accountId ?? raw.account_id),
    employeeId: text(raw.employeeId ?? raw.employee_id),
    postType: text(raw.postType ?? raw.post_type),
    postUrl: text(raw.postUrl ?? raw.post_url),
    coverImageUrl: text(raw.coverImageUrl ?? raw.cover_image_url),
    publishedAt: text(raw.publishedAt ?? raw.published_at),
    metricsUpdatedAt: text(raw.metricsUpdatedAt ?? raw.metrics_updated_at),
    metrics: {
      traffic: numberValue(raw.traffic),
      likes: numberValue(raw.likes),
      comments: numberValue(raw.comments),
      favorites: numberValue(raw.favorites),
      shares: numberValue(raw.shares),
      leadsCount,
    },
  };
}

export default function OperationRankingsPage() {
  const [items, setItems] = useState<RankingRow[]>([]);
  const [learningItems, setLearningItems] = useState<ContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RankingType>('posts');
  const [period, setPeriod] = useState<Period>('7d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 20;

  async function load(nextPage = page, nextType = type, nextPeriod = period) {
    setLoading(true);
    setError(undefined);
    try {
      if (nextType === 'learning') {
        const payload = await apiClient.get<unknown[]>('/rankings/learning-posts', {
          query: { days: Number(nextPeriod.replace('d', '')) },
        });
        const rows = Array.isArray(payload) ? payload : [];
        setItems([]);
        setLearningItems(rows.map((item) => mapLearningPost(item as Record<string, unknown>)));
        setTotal(rows.length);
        setPage(1);
      } else {
        const result = await listRankings(nextType, { page: nextPage, pageSize, period: nextPeriod });
        setItems(result.items);
        setLearningItems([]);
        setTotal(result.total);
        setPage(result.page);
      }
    } catch (err) {
      setItems([]);
      setLearningItems([]);
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
    load(1, nextType, period);
  }

  function changePeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    load(1, type, nextPeriod);
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

  const learningColumns: ColumnsType<ContentPost> = [
    {
      title: '排名',
      width: 80,
      render: (_, __, index) => index + 1,
    },
    {
      title: '作品',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.title}</Typography.Text>
          <Typography.Text type="secondary">{record.platform} · {record.postType || '未分类'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '获客数',
      render: (_, record) => record.metrics.leadsCount,
    },
    {
      title: '流量',
      render: (_, record) => record.metrics.traffic,
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      render: (value?: string) => value || '-',
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>排行榜</Typography.Title>
          <Typography.Paragraph type="secondary">查看员工、作品和获客表现榜单。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Radio.Group value={type} onChange={(event) => changeType(event.target.value)}>
            <Radio.Button value="posts">作品榜</Radio.Button>
            <Radio.Button value="leads">获客榜</Radio.Button>
            <Radio.Button value="traffic">流量榜</Radio.Button>
            <Radio.Button value="learning">学习榜单</Radio.Button>
          </Radio.Group>
          <Radio.Group value={period} onChange={(event) => changePeriod(event.target.value)}>
            <Radio.Button value="7d">近 7 天</Radio.Button>
            <Radio.Button value="14d">近 14 天</Radio.Button>
            <Radio.Button value="30d">近 30 天</Radio.Button>
          </Radio.Group>
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message="排行榜暂不可用" description={error} /> : null}
      <Card>
        {type === 'learning' ? (
          <Table
            rowKey="id"
            loading={loading}
            columns={learningColumns}
            dataSource={learningItems}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无学习榜单数据" /> }}
          />
        ) : (
          <>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={items}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无榜单数据" /> }}
            />
            <Pagination current={page} pageSize={pageSize} total={total} onChange={(nextPage) => load(nextPage)} style={{ marginTop: 16, textAlign: 'right' }} />
          </>
        )}
      </Card>
    </Space>
  );
}
