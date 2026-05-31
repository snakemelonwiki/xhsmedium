'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listPosts, refreshPostMetrics } from '@/shared/api/content';
import type { ContentPost } from '@/shared/types/content';

export default function OperationPostsPage() {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 20;

  async function load(nextPage = page) {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listPosts({ page: nextPage, pageSize });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '作品列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function refresh(post: ContentPost) {
    try {
      await refreshPostMetrics(post.id, post.postUrl);
      message.success('已提交刷新');
      await load(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '刷新失败');
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<ContentPost> = [
    {
      title: '平台',
      dataIndex: 'platform',
      width: 110,
      render: (platform: string) => <Tag color={platform.includes('抖') ? 'blue' : 'red'}>{platform}</Tag>,
    },
    {
      title: '作品',
      dataIndex: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.title}</Typography.Text>
          <Typography.Text type="secondary">{record.postType || '未分类'} · {record.publishedAt || '未发布'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '账号',
      width: 160,
      render: (_, record) => record.accountName || record.accountId || '-',
    },
    {
      title: '数据',
      width: 260,
      render: (_, record) => (
        <Space wrap>
          <Tag>流量 {record.metrics.traffic}</Tag>
          <Tag>赞 {record.metrics.likes}</Tag>
          <Tag>评 {record.metrics.comments}</Tag>
          <Tag>藏 {record.metrics.favorites}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refresh(record)} disabled={!record.postUrl}>
            刷新
          </Button>
          <Link href={`/operation/posts/${record.id}/edit`}>
            <Button size="small">编辑</Button>
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>作品列表</Typography.Title>
          <Typography.Paragraph type="secondary">查看运营作品发布和互动数据，支持刷新指标和编辑作品信息。</Typography.Paragraph>
        </div>
        <Link href="/operation/posts/new"><Button type="primary">新建作品</Button></Link>
      </div>
      {error ? <Alert type="warning" showIcon message="作品数据暂不可用" description={error} /> : null}
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
        />
        <Pagination current={page} pageSize={pageSize} total={total} onChange={load} style={{ marginTop: 16, textAlign: 'right' }} />
      </Card>
    </Space>
  );
}
