'use client';

import { Alert, Button, Card, Empty, List, Space, Statistic, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getDashboardSummary, listPostTypeDistribution, listPosts } from '@/shared/api/content';
import type { ContentPost, DashboardSummary, PostTypeDistribution } from '@/shared/types/content';

export default function OperationDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [distribution, setDistribution] = useState<PostTypeDistribution[]>([]);
  const [recentPosts, setRecentPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const [summaryResult, distributionResult, postsResult] = await Promise.all([
        getDashboardSummary(),
        listPostTypeDistribution().catch(() => []),
        listPosts({ page: 1, pageSize: 5 }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 5 })),
      ]);
      setSummary(summaryResult);
      setDistribution(distributionResult);
      setRecentPosts(postsResult.items);
    } catch (err) {
      setSummary(undefined);
      setDistribution([]);
      setRecentPosts([]);
      setError(err instanceof Error ? err.message : '个人看板加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = [
    { title: '今日作品', value: (summary?.xhsPosts ?? 0) + (summary?.douyinPosts ?? 0) },
    { title: '今日客资', value: summary?.todayLeads ?? 0 },
    { title: '今日成交', value: summary?.todayDeals ?? 0 },
    { title: '参与员工', value: summary?.updatedEmployees ?? 0 },
    { title: '小红书互动', value: (summary?.xhsLikes ?? 0) + (summary?.xhsComments ?? 0) + (summary?.xhsFavorites ?? 0) },
    { title: '抖音互动', value: (summary?.douyinLikes ?? 0) + (summary?.douyinComments ?? 0) + (summary?.douyinFavorites ?? 0) },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>个人看板</Typography.Title>
          <Typography.Paragraph type="secondary">聚合今日作品、客资和互动指标，快速进入常用运营动作。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Link href="/operation/posts/new"><Button type="primary">录入作品</Button></Link>
          <Link href="/operation/leads/new"><Button>录入客资</Button></Link>
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message="看板数据暂不可用" description={error} /> : null}
      <div className="metric-grid">
        {stats.map((item) => (
          <Card key={item.title} loading={loading}>
            <Statistic title={item.title} value={item.value} />
          </Card>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
        <Card title="最近作品" loading={loading}>
          {recentPosts.length ? (
            <List
              dataSource={recentPosts}
              renderItem={(post) => (
                <List.Item>
                  <List.Item.Meta
                    title={post.title}
                    description={`${post.platform} · ${post.postType || '未分类'} · 线索 ${post.metrics.leadsCount}`}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无最近作品" />
          )}
        </Card>
        <Card title="作品类型" loading={loading}>
          {distribution.length ? (
            <List
              dataSource={distribution}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>{item.type}</Typography.Text>
                  <Typography.Text type="secondary">{item.count} · {item.ratio || '-'}</Typography.Text>
                </List.Item>
              )}
            />
          ) : (
            <Empty description="暂无类型分布" />
          )}
        </Card>
      </div>
    </Space>
  );
}
