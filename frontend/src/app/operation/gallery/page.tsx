'use client';

import { HeartOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Select, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';

import { listGalleryPosts, togglePostFavorite } from '@/shared/api/content';
import type { ContentPost } from '@/shared/types/content';

const platformOptions = [
  { label: '全部平台', value: 'all' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const typeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '素人贴', value: '素人贴' },
  { label: '话题贴', value: '话题贴' },
  { label: '获客贴', value: '获客贴' },
  { label: '视频', value: 'video' },
];

export default function OperationGalleryPage() {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState('all');
  const [postType, setPostType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 12;

  async function load(nextPage = page, nextPlatform = platform, nextType = postType) {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listGalleryPosts({
        page: nextPage,
        pageSize,
        platform: nextPlatform === 'all' ? undefined : nextPlatform,
        postType: nextType === 'all' ? undefined : nextType,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '作品广场加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changePlatform(value: string) {
    setPlatform(value);
    load(1, value, postType);
  }

  function changeType(value: string) {
    setPostType(value);
    load(1, platform, value);
  }

  async function toggleFavorite(post: ContentPost) {
    try {
      const result = await togglePostFavorite(post.id);
      setItems((current) => current.map((item) => {
        if (item.id !== post.id) return item;
        const currentCount = item.metrics.favorites || 0;
        const nextCount = result.favorites ?? Math.max(0, currentCount + (result.isFavorited ? 1 : -1));
        return {
          ...item,
          isFavorited: result.isFavorited,
          metrics: { ...item.metrics, favorites: nextCount },
        };
      }));
      message.success(result.isFavorited ? '已收藏' : '已取消收藏');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '收藏操作失败');
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>作品广场</Typography.Title>
          <Typography.Paragraph type="secondary">浏览全部运营作品，按平台和类型筛选优秀内容。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Select value={platform} options={platformOptions} onChange={changePlatform} style={{ width: 128 }} />
          <Select value={postType} options={typeOptions} onChange={changeType} style={{ width: 128 }} />
        </Space>
      </div>
      {error ? <Alert type="warning" showIcon message="作品广场暂不可用" description={error} /> : null}
      <Card loading={loading}>
        {items.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {items.map((post) => (
              <Card
                key={post.id}
                size="small"
                cover={
                  post.coverThumbUrl || post.coverImageUrl
                    ? <img src={post.coverThumbUrl || post.coverImageUrl} alt={post.title} style={{ height: 148, objectFit: 'cover' }} />
                    : undefined
                }
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color={post.platform.includes('抖') ? 'blue' : 'red'}>{post.platform}</Tag>
                    <Tag>{post.postType || '未分类'}</Tag>
                  </Space>
                  <Typography.Text strong ellipsis>{post.title}</Typography.Text>
                  <Typography.Text type="secondary">{post.accountName || post.accountId || '未知账号'}</Typography.Text>
                  <Space wrap>
                    <Tag>线索 {post.metrics.leadsCount}</Tag>
                    <Tag>赞 {post.metrics.likes}</Tag>
                    <Tag>藏 {post.metrics.favorites}</Tag>
                  </Space>
                  <Button icon={<HeartOutlined />} type={post.isFavorited ? 'primary' : 'default'} block onClick={() => toggleFavorite(post)}>
                    {post.isFavorited ? '已收藏' : '收藏'}
                  </Button>
                </Space>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="暂无作品" />
        )}
        <Pagination current={page} pageSize={pageSize} total={total} onChange={(next) => load(next)} style={{ marginTop: 16, textAlign: 'right' }} />
      </Card>
    </Space>
  );
}
