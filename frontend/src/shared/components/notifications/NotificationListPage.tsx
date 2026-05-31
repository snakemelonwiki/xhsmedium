'use client';

import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, List, Pagination, Segmented, Space, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationQuery,
} from '@/shared/api/notifications';
import { StatusTag } from '@/shared/components/status';
import type { NotificationItem } from '@/shared/types/notifications';

type NotificationListPageProps = {
  title: string;
  description: string;
};

const pageSize = 20;

export function NotificationListPage({ title, description }: NotificationListPageProps) {
  const router = useRouter();
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
    if (item.routeHint) {
      router.push(item.routeHint);
      return;
    }
    await load(page);
  }

  async function readAll() {
    try {
      await markAllNotificationsRead();
      message.success('已全部标记为已读');
      await load(1, status);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记全部已读失败');
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
                    <Button key="read" size="small" onClick={() => openNotification(item)}>
                      查看并已读
                    </Button>
                  ) : (
                    <Button key="open" size="small" onClick={() => openNotification(item)}>
                      查看
                    </Button>
                  ),
                ]}
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
                      <Typography.Text type="secondary">{item.createdAt || '-'}</Typography.Text>
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
