'use client';

import {
  DeleteOutlined,
  EyeOutlined,
  HeartFilled,
  ShopOutlined,
  StarFilled,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Pagination,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  listMyFavorites,
  removeFavorite,
  type FavoriteAccountSnapshot,
  type FavoriteItem,
  type FavoritePostSnapshot,
  type FavoriteTargetType,
} from '@/shared/api/favorites';
import { formatDateTime } from '@/shared/utils/date-format';

type Tab = 'all' | 'post' | 'account';

const TAB_OPTIONS: { label: string; value: Tab }[] = [
  { label: '全部', value: 'all' },
  { label: '作品', value: 'post' },
  { label: '账号', value: 'account' },
];

/**
 * v1.3 / OP-11 我的收藏页
 * - 顶部 Tab 切换全部 / 作品 / 账号
 * - 卡片列表（作品/账号分别渲染）
 * - 取消收藏按钮直接调用 favorites/toggle
 * - 作品卡片点击跳到作品详情（复用 /operation/gallery 的查看逻辑）
 */
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
    const next = String(value) as Tab;
    setTab(next);
    setPage(1);
  }

  async function handleRemove(item: FavoriteItem) {
    Modal.confirm({
      title: '确认取消收藏？',
      content: item.targetType === 'post'
        ? `「${(item.target as FavoritePostSnapshot | null)?.title || item.targetId}」将从你的收藏列表移除`
        : `「${(item.target as FavoriteAccountSnapshot | null)?.accountName || item.targetId}」将从你的收藏列表移除`,
      okText: '确认取消',
      cancelText: '再想想',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await removeFavorite(item.targetType, item.targetId);
          message.success('已取消收藏');
          await load(page, tab);
        } catch (err) {
          message.error(err instanceof Error ? err.message : '取消收藏失败');
        }
      },
    });
  }

  const postCount = items.filter((i) => i.targetType === 'post').length;
  const accountCount = items.filter((i) => i.targetType === 'account').length;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>
            <Space>
              <StarFilled style={{ color: '#faad14' }} />
              我的收藏
            </Space>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            收藏的作品与账号，支持一键取消收藏。当前共 <strong>{total}</strong> 条
            （作品 {postCount} / 账号 {accountCount}）。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented<Tab>
            value={tab}
            onChange={handleTabChange}
            options={TAB_OPTIONS}
          />
          <Button onClick={() => void load(page, tab)} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="收藏数据暂不可用" description={error} />
      ) : null}

      <Card loading={loading}>
        {items.length === 0 ? (
          <Empty description="暂无收藏" />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
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

function FavoriteCard({
  item,
  onRemove,
}: {
  item: FavoriteItem;
  onRemove: (item: FavoriteItem) => void;
}) {
  if (item.targetType === 'post') {
    const post = item.target as FavoritePostSnapshot | null;
    return (
      <Card
        size="small"
        hoverable
        cover={
          post?.coverThumbUrl || post?.coverImageUrl ? (
            <img
              src={post.coverThumbUrl || post.coverImageUrl}
              alt={post?.title}
              style={{ height: 140, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                height: 140,
                background: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography.Text type="secondary">无封面</Typography.Text>
            </div>
          )
        }
        actions={[
          post?.postUrl ? (
            <Tooltip key="open" title="打开原帖">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => window.open(post.postUrl, '_blank')}
              />
            </Tooltip>
          ) : null,
          <Tooltip key="remove" title="取消收藏">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onRemove(item)}
            />
          </Tooltip>,
        ].filter(Boolean) as React.ReactNode[]}
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color={post?.platform?.includes('抖') ? 'blue' : 'red'}>
              {post?.platform || '未识别平台'}
            </Tag>
            {post?.postType ? <Tag>{post.postType}</Tag> : null}
          </Space>
          <Typography.Text strong ellipsis={{ tooltip: post?.title }}>
            {post?.title || `作品 ${item.targetId.slice(0, 8)}`}
          </Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
            收藏于 {formatDateTime(item.createdAt)}
          </Typography.Text>
          {!post ? (
            <Alert
              type="warning"
              showIcon={false}
              message="该作品已删除"
              style={{ fontSize: 12, padding: '2px 8px' }}
            />
          ) : null}
        </Space>
      </Card>
    );
  }

  const account = item.target as FavoriteAccountSnapshot | null;
  return (
    <Card
      size="small"
      hoverable
      actions={[
        account?.profileUrl ? (
          <Tooltip key="open" title="打开账号主页">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => window.open(account.profileUrl, '_blank')}
            />
          </Tooltip>
        ) : null,
        <Tooltip key="remove" title="取消收藏">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onRemove(item)}
          />
        </Tooltip>,
      ].filter(Boolean) as React.ReactNode[]}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space wrap>
          <Tag icon={<ShopOutlined />} color={account?.platform?.includes('抖') ? 'blue' : 'red'}>
            {account?.platform || '未识别平台'}
          </Tag>
          <Tag color="purple">
            <UserOutlined /> 账号
          </Tag>
        </Space>
        <Typography.Text strong ellipsis={{ tooltip: account?.accountName }}>
          {account?.accountName || `账号 ${item.targetId.slice(0, 8)}`}
        </Typography.Text>
        <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
          收藏于 {formatDateTime(item.createdAt)}
        </Typography.Text>
        {!account ? (
          <Alert
            type="warning"
            showIcon={false}
            message="该账号已删除"
            style={{ fontSize: 12, padding: '2px 8px' }}
          />
        ) : null}
      </Space>
    </Card>
  );
}
