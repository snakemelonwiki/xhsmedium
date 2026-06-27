'use client';

import { DeleteOutlined, EyeOutlined, ShopOutlined, StarFilled, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Popconfirm, Segmented, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { listMyFavorites, removeFavorite, type FavoriteAccountSnapshot, type FavoriteItem, type FavoritePostSnapshot, type FavoriteTargetType } from '@/shared/api/favorites';
import { LazyImage } from '@/shared/components/LazyImage';
import { formatDateTime } from '@/shared/utils/date-format';

type Tab = 'all' | 'post' | 'account';

const TAB_OPTIONS: { label: string; value: Tab }[] = [
  { label: '全部', value: 'all' },
  { label: '作品', value: 'post' },
  { label: '账号', value: 'account' },
];

export default function OperationFavoritesPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(
    async (nextPage = page, nextTab = tab) => {
      setLoading(true);
      setError(undefined);
      try {
        const result = await listMyFavorites({
          targetType: nextTab === 'all' ? undefined : (nextTab as FavoriteTargetType),
          limit: pageSize,
          offset: (nextPage - 1) * pageSize,
        });
        setItems(result.items);
        setTotal(result.total);
        setPage(nextPage);
      } catch (err) {
        setItems([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : '收藏列表加载失败');
      } finally {
        setLoading(false);
      }
    },
    [page, tab, pageSize],
  );

  useEffect(() => {
    void load(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function handleTabChange(value: string | number) {
    setTab(String(value) as Tab);
    setPage(1);
  }

  async function handleRemove(item: FavoriteItem) {
    const removedId = item.id;
    // 乐观更新
    setItems((prev) => prev.filter((it) => it.id !== removedId));
    setTotal((prev) => Math.max(0, prev - 1));
    try {
      const result = await removeFavorite(item.targetType, item.targetId);
      if (!result.ok) {
        // 回滚
        setItems((prev) => [...prev, item].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        setTotal((prev) => prev + 1);
        message.error('取消收藏失败，请重新登录后重试');
        return;
      }
      message.success('已取消收藏');
      await load(page, tab);
    } catch (err) {
      setItems((prev) => [...prev, item].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setTotal((prev) => prev + 1);
      message.error(err instanceof Error ? err.message : '取消收藏失败');
    }
  }

  const postCount = items.filter((i) => i.targetType === 'post').length;
  const accountCount = items.filter((i) => i.targetType === 'account').length;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>
            <Space><StarFilled style={{ color: '#faad14' }} />我的收藏</Space>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            收藏的作品与账号，支持一键取消收藏。当前共 <strong>{total}</strong> 条（作品 {postCount} / 账号 {accountCount}）。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented<Tab> value={tab} onChange={handleTabChange} options={TAB_OPTIONS} />
          <Button onClick={() => void load(page, tab)} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message="收藏数据暂不可用" description={error} /> : null}

      <Card loading={loading}>
        {items.length === 0 ? (
          <Empty description="暂无收藏" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {items.map((item) => (
              <FavoriteCard key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        )}
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(next) => void load(next, tab)}
          style={{ marginTop: 16, textAlign: 'right' }}
          showSizeChanger={false}
        />
      </Card>
    </Space>
  );
}

function FavoriteCard({ item, onRemove }: { item: FavoriteItem; onRemove: (item: FavoriteItem) => Promise<void> }) {
  const isPost = item.targetType === 'post';
  const post = isPost ? (item.target as FavoritePostSnapshot | null) : null;
  const account = !isPost ? (item.target as FavoriteAccountSnapshot | null) : null;
  const title = isPost ? (post?.title || `作品 ${item.targetId.slice(0, 8)}`) : (account?.accountName || `账号 ${item.targetId.slice(0, 8)}`);
  const platform = isPost ? post?.platform : account?.platform;

  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* 封面（仅作品） */}
      {isPost && (post?.coverThumbUrl || post?.coverImageUrl) ? (
        <LazyImage
          src={post.coverThumbUrl || post.coverImageUrl}
          alt={post?.title || '作品封面'}
          style={{ width: '100%', height: 140, objectFit: 'cover' }}
        />
      ) : isPost ? (
        <div style={{ width: '100%', height: 140, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography.Text type="secondary">无封面</Typography.Text>
        </div>
      ) : null}

      {/* 内容 */}
      <div style={{ padding: 12 }}>
        <Space wrap style={{ marginBottom: 6 }}>
          <Tag color={platform?.includes('抖') ? 'blue' : 'red'}>
            {isPost ? (post?.platform || '未识别平台') : <><ShopOutlined /> {account?.platform || '未识别平台'}</>}
          </Tag>
          {isPost && post?.postType ? <Tag>{post.postType}</Tag> : null}
          {!isPost ? <Tag color="purple"><UserOutlined /> 账号</Tag> : null}
        </Space>

        <Typography.Text strong ellipsis={{ tooltip: title }} style={{ display: 'block', marginBottom: 4 }}>
          {title}
        </Typography.Text>

        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          收藏于 {formatDateTime(item.createdAt)}
        </Typography.Text>

        {isPost && !post ? (
          <Alert type="warning" showIcon={false} message="该作品已删除" style={{ fontSize: 12, padding: '2px 8px', marginBottom: 8 }} />
        ) : null}
        {!isPost && !account ? (
          <Alert type="warning" showIcon={false} message="该账号已删除" style={{ fontSize: 12, padding: '2px 8px', marginBottom: 8 }} />
        ) : null}

        {/* 按钮区：直接渲染在卡片 body 内，避免 Card actions/extra 的事件拦截问题 */}
        <Space size={8}>
          {isPost && post?.postUrl ? (
            <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(post.postUrl, '_blank')}>
              查看原帖
            </Button>
          ) : null}
          {!isPost && account?.profileUrl ? (
            <Button size="small" icon={<EyeOutlined />} onClick={() => window.open(account.profileUrl, '_blank')}>
              查看主页
            </Button>
          ) : null}
          <Popconfirm
            title="确认取消收藏？"
            description={`将「${title}」从收藏列表移除`}
            onConfirm={() => void onRemove(item)}
            okText="确认"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              取消收藏
            </Button>
          </Popconfirm>
        </Space>
      </div>
    </div>
  );
}
