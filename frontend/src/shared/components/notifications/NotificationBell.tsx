'use client';

import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { Badge, Button, Drawer, Dropdown, Empty, List, Space, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useNotifications } from '@/shared/contexts/NotificationContext';
import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';
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
  const { items, unreadCount, loading, refresh, markRead, markAllRead } = useNotifications();
  const { isMobile } = useResponsiveBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const handleReadSingle = useCallback(
    async (e: React.MouseEvent, item: NotificationItem) => {
      e.stopPropagation();
      if (item.unread) {
        try {
          await markRead(item.id);
          await refresh();
        } catch {
          // 静默失败
        }
      }
    },
    [markRead, refresh],
  );

  const handleReadAll = useCallback(async () => {
    try {
      await markAllRead();
    } catch {
      // 静默失败，context 里已有 toast
    }
  }, [markAllRead]);

  const panelContent = (
    <div className="notification-panel">
      <Space direction="vertical" size={12} className="page-stack" style={{ width: '100%' }}>
        <div className="notification-panel-header">
          <Typography.Text strong>消息提醒</Typography.Text>
          <Space size={8}>
            <Button size="small" type="link" onClick={refresh} loading={loading}>刷新</Button>
            <Button size="small" type="link" icon={<CheckOutlined />} onClick={handleReadAll} disabled={!unreadCount}>
              全部已读
            </Button>
          </Space>
        </div>
        {items.length ? (
          <List
            size="small"
            dataSource={items}
            renderItem={(item) => (
              <List.Item className="notification-item">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    width: '100%',
                  }}
                >
                  <div
                    onClick={() => openNotification(item)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space size={4} style={{ width: '100%' }}>
                        <StatusTag kind="notificationType" code={item.notificationType} />
                        <Typography.Text strong ellipsis={{ tooltip: item.title }} style={{ flex: 1, minWidth: 0 }}>
                          {item.title}
                        </Typography.Text>
                      </Space>
                      {item.content ? (
                        <Typography.Text
                          type="secondary"
                          ellipsis={{ tooltip: item.content }}
                          style={{ display: 'block' }}
                        >
                          {item.content}
                        </Typography.Text>
                      ) : null}
                    </Space>
                  </div>
                  {item.unread ? (
                    <Button
                      key="read"
                      size="small"
                      onClick={(e) => handleReadSingle(e, item)}
                    >
                      已读
                    </Button>
                  ) : null}
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" />
        )}
      </Space>
    </div>
  );

  const triggerButton = (
    <Button
      type="text"
      className={unreadCount > 0 ? 'notification-bell-pulse' : undefined}
      icon={<Badge count={unreadCount} size="small"><BellOutlined /></Badge>}
    >
      消息
    </Button>
  );

  if (!isMobile) {
    return (
      <Dropdown popupRender={() => panelContent} trigger={['click']} placement="bottomRight">
        {triggerButton}
      </Dropdown>
    );
  }

  return (
    <>
      <Badge count={unreadCount} size="small">
        <Button type="text" icon={<BellOutlined />} onClick={() => setDrawerOpen(true)}>
          消息
        </Button>
      </Badge>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="bottom"
        height="auto"
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        {panelContent}
      </Drawer>
    </>
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
  // N-P1-08 修复：导出/导入通知补回路由。导出：当前只 /academic/exports 有页面，
  // 全部端口统一跳过去。导入：admin 优先 /admin/imports，运营回落到 /operation/imports。
  if (type.includes('export')) {
    return `/academic/exports?taskId=${targetId}`;
  }
  if (type.includes('import')) {
    return normalizedPort === 'admin'
      ? `/admin/imports?taskId=${targetId}`
      : `/operation/imports?taskId=${targetId}`;
  }
  return undefined;
}
