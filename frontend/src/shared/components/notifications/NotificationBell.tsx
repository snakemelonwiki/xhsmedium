'use client';

import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Dropdown, Empty, List, Space, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { listNotifications } from '@/shared/api/notifications';
import { StatusTag } from '@/shared/components/status';
import type { NotificationItem } from '@/shared/types/notifications';

type NotificationBellProps = {
  pollIntervalMs?: number;
};

/**
 * Minimal polling notification entry used by all port headers and message pages.
 */
export function NotificationBell({ pollIntervalMs = 0 }: NotificationBellProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listNotifications({ pageSize: 8 });
      setItems(result.items);
      setUnreadCount(Number(result.unreadCount || result.items.filter((item) => item.unread).length));
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!pollIntervalMs) return undefined;
    const timer = window.setInterval(refresh, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  const overlay = (
    <div className="notification-panel">
      <Space direction="vertical" size={12} className="page-stack">
        <div className="notification-panel-header">
          <Typography.Text strong>消息提醒</Typography.Text>
          <Button size="small" type="link" onClick={refresh} loading={loading}>刷新</Button>
        </div>
        {items.length ? (
          <List
            size="small"
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className="notification-item"
                onClick={() => {
                  const route = item.routeHint ?? fallbackRoute(item);
                  if (route) router.push(route);
                }}
              >
                <Space direction="vertical" size={4}>
                  <Space>
                    <StatusTag kind="notificationType" code={item.notificationType} />
                    <Typography.Text strong>{item.title}</Typography.Text>
                  </Space>
                  {item.content ? <Typography.Text type="secondary">{item.content}</Typography.Text> : null}
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" />
        )}
      </Space>
    </div>
  );

  return (
    <Dropdown popupRender={() => overlay} trigger={['click']} placement="bottomRight">
      <Button type="text" icon={<Badge count={unreadCount} size="small"><BellOutlined /></Badge>}>
        消息
      </Button>
    </Dropdown>
  );
}

function fallbackRoute(item: NotificationItem) {
  const type = item.targetType?.toLowerCase();
  const targetId = item.targetId;
  if (!type || targetId === undefined || targetId === null) return undefined;
  if (type.includes('lead')) return `/sales/leads/${targetId}`;
  if (type.includes('collaboration')) return '/sales/collaboration';
  if (type.includes('order')) return `/sales/orders/${targetId}`;
  return undefined;
}
