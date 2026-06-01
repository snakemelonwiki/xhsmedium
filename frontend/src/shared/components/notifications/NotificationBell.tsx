'use client';

import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Dropdown, Empty, List, Space, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useNotifications } from '@/shared/contexts/NotificationContext';
import { StatusTag } from '@/shared/components/status';
import type { NotificationItem } from '@/shared/types/notifications';

type NotificationBellProps = {
  /** 兼容旧接口：实时通道 + 兜底轮询已在 NotificationContext 内统一管理，这里忽略。 */
  pollIntervalMs?: number;
};

/**
 * Minimal notification bell used by all port headers.
 * 数据由 NotificationContext 提供：socket 实时推送 + 60s 兜底轮询。
 */
export function NotificationBell(_props: NotificationBellProps = {}) {
  const router = useRouter();
  const { items, unreadCount, loading, refresh, markRead } = useNotifications();

  const openNotification = useCallback(
    async (item: NotificationItem) => {
      const route = item.routeHint ?? fallbackRoute(item);
      if (item.unread) {
        try {
          await markRead(item.id);
        } catch {
          // context 已做乐观回滚，吞掉即可
        }
      }
      if (route) router.push(route);
    },
    [markRead, router],
  );

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
                onClick={() => openNotification(item)}
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
  const normalizedPort = item.portType === 'operations' ? 'operation' : item.portType;
  if (!type || targetId === undefined || targetId === null) return undefined;
  if (type.includes('lead')) {
    return normalizedPort === 'operation'
      ? `/operation/leads?leadId=${targetId}`
      : `/sales/leads/${targetId}`;
  }
  if (type.includes('collaboration')) {
    return normalizedPort === 'operation'
      ? `/operation/collaboration?taskId=${targetId}`
      : `/sales/collaboration?taskId=${targetId}`;
  }
  if (type.includes('order')) {
    if (normalizedPort === 'academic') return `/academic/orders?orderId=${targetId}`;
    if (normalizedPort === 'admin') return `/admin/orders?orderId=${targetId}`;
    return `/sales/orders/${targetId}`;
  }
  return undefined;
}
