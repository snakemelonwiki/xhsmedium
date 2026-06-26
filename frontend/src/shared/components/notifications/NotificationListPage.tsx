'use client';

import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, List, Pagination, Segmented, Space, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  listNotifications,
  markNotificationRead,
  type NotificationQuery,
} from '@/shared/api/notifications';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import { StatusTag } from '@/shared/components/status';
import type { NotificationItem } from '@/shared/types/notifications';
import { formatDateTime } from '@/shared/utils/date-format';

type NotificationListPageProps = {
  title: string;
  description: string;
};

const pageSize = 20;

export function NotificationListPage({ title, description }: NotificationListPageProps) {
  const router = useRouter();
  const { markRead, markAllRead } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<NotificationQuery['status']>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(nextPage = page, nextStatus = status) {
    setLoading(true);
    setError('');
    try {
      const result = await listNotifications({ page: nextPage, pageSize, status: nextStatus });
      setItems(result.items);
      setTotal(result.total);
      setUnreadCount(result.unreadCount);
      setPage(result.page);
    } catch (err) {
      const text = err instanceof Error ? err.message : '消息列表加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function openNotification(item: NotificationItem) {
    if (item.unread) {
      try {
        await markNotificationRead(item.id);
      } catch (err) {
        message.warning(err instanceof Error ? err.message : '标记已读失败');
      }
    }
    // 订单异常消息：显式跳销售端订单详情（即便 backend 没回 routeHint 也能兜底）
    if (
      item.notificationType === 'order_abnormal' ||
      item.targetType === 'order_abnormal'
    ) {
      const target = item.targetId;
      if (target != null) {
        router.push(`/sales/orders/${target}`);
        return;
      }
    }
    if (item.routeHint) {
      router.push(item.routeHint);
      return;
    }
    await load(page);
  }

  async function readSingle(id: string | number) {
    // 乐观更新：立即更新本地状态，不等后端响应
    let wasUnread = false;
    setItems((prev) => {
      const filtered = status === 'unread'
        ? prev.filter((entry) => String(entry.id) !== String(id))
        : prev.map((entry) => {
            if (String(entry.id) === String(id) && entry.unread) {
              wasUnread = true;
              return { ...entry, unread: false };
            }
            return entry;
          });
      return filtered;
    });
    if (wasUnread) setUnreadCount((n) => Math.max(0, n - 1));
    if (status === 'unread') setTotal((n) => Math.max(0, n - 1));

    try {
      // 通过 Context 标记已读，保持 Bell badge 同步
      await markRead(id);
      await load(page, status);
    } catch {
      // Context 已做乐观回滚；这里刷新列表对齐服务端
      await load(page, status);
    }
  }

  async function readAll() {
    // 乐观更新：立即清空未读标记
    setItems((prev) => prev.map((entry) => ({ ...entry, unread: false })));
    setUnreadCount(0);

    try {
      // 通过 Context 标记全部已读，保持 Bell badge 同步
      await markAllRead();
      message.success('已全部标记为已读');
      // 全部已读后自动切到「未读」筛选，用户看到的就是空列表，符合预期
      setStatus('unread');
    } catch {
      // Context 已做乐观回滚；这里刷新列表对齐服务端
      await load(page, status);
      message.error('标记全部已读失败');
    }
  }

  useEffect(() => {
    load(1, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={status}
            onChange={(value) => setStatus(value as NotificationQuery['status'])}
            options={[
              { label: '全部', value: 'all' },
              { label: `未读 ${unreadCount}`, value: 'unread' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>刷新</Button>
          <Button icon={<CheckOutlined />} onClick={readAll} disabled={!unreadCount}>全部已读</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        {items.length ? (
          <List
            loading={loading}
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className="notification-list-item"
                actions={[
                  item.unread ? (
                    <Button
                      key="read-only"
                      size="small"
                      onClick={() => readSingle(item.id)}
                    >
                      已读
                    </Button>
                  ) : null,
                  <Button key="open" size="small" onClick={() => openNotification(item)}>
                    查看
                  </Button>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={(
                    <Space wrap>
                      <StatusTag kind="notificationType" code={item.notificationType} />
                      <Typography.Text strong={item.unread}>{item.title}</Typography.Text>
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={4}>
                      {item.content ? <Typography.Text type="secondary">{item.content}</Typography.Text> : null}
                      <Typography.Text type="secondary">{formatDateTime(item.createdAt)}</Typography.Text>
                    </Space>
                  )}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无消息" />
        )}
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(nextPage) => load(nextPage, status)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>
    </Space>
  );
}
