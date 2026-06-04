'use client';

import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  List,
  Pagination,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationQuery,
} from '@/shared/api/notifications';
import { apiClient } from '@/shared/api/apiClient';
import { getReminderUnreadCount } from '@/shared/api/reminders';
import { StatusTag } from '@/shared/components/status';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import type { NotificationItem } from '@/shared/types/notifications';
import { formatDateTime } from '@/shared/utils/date-format';

/**
 * 主管消息中心支持的通知类型
 *
 * v1.3 SUP-3 增量：新增 `reminder` 类型，对应 CROSS-3 通用提醒（销售/运营/主管互相发送）。
 * reminder 在列表里走通用 notification 接口；额外的 "按发送者聚合" 视图
 * 通过 GET /api/notifications/unread-by-sender 取得。
 */
type AdminNotificationType =
  | 'all'
  | 'collaboration_timeout'
  | 'employee_low_update'
  | 'lead_backlog'
  | 'account_abnormal'
  | 'export_done'
  | 'reminder';

const ADMIN_NOTIFICATION_TYPES: { value: AdminNotificationType; label: string; color?: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'collaboration_timeout', label: '协同超时', color: 'red' },
  { value: 'employee_low_update', label: '员工低更新', color: 'orange' },
  { value: 'lead_backlog', label: '客资积压', color: 'purple' },
  { value: 'account_abnormal', label: '账号异常', color: 'magenta' },
  { value: 'export_done', label: '导出完成', color: 'green' },
  { value: 'reminder', label: '跨端口提醒', color: 'cyan' },
];

const PAGE_SIZE = 20;

type ReminderSender = {
  senderId: string;
  senderName: string;
  count: number;
  latestContent: string | null;
  latestAt: string | null;
};

type ReminderGroupPayload = {
  total: number;
  senders: ReminderSender[];
};

/**
 * 根据通知类型构建跳转链接
 */
function buildRouteHint(item: NotificationItem): string | undefined {
  const { notificationType, targetType, targetId, routeHint } = item;

  // 如果已有 routeHint，直接使用
  if (routeHint) return routeHint;

  const normalizedType = (targetType || '').toLowerCase();
  const normalizedNotifType = (notificationType || '').toLowerCase();
  const id = targetId ? String(targetId) : undefined;

  // 协同超时消息
  if (normalizedNotifType.includes('collaboration') || normalizedNotifType.includes('timeout')) {
    if (normalizedType.includes('collaboration')) {
      return `/admin/collaboration?taskId=${id}`;
    }
    return `/admin/collaboration`;
  }

  // 导出完成消息
  if (normalizedNotifType.includes('export')) {
    return `/admin/exports`;
  }

  // 员工低更新消息
  if (normalizedNotifType.includes('employee') || normalizedNotifType.includes('low_update')) {
    return `/admin/personal${id ? `?employeeId=${id}` : ''}`;
  }

  // 客资积压消息
  if (normalizedNotifType.includes('lead') || normalizedNotifType.includes('backlog')) {
    return `/admin/leads`;
  }

  // 账号异常消息
  if (normalizedNotifType.includes('account') || normalizedNotifType.includes('abnormal')) {
    return `/admin/accounts`;
  }

  // 跨端口提醒（reminder）：按 relatedType 跳到对应详情页
  if (normalizedNotifType === 'reminder') {
    if (normalizedType === 'post' && id) {
      return `/admin/posts?highlight=${id}`;
    }
    if (normalizedType === 'lead' && id) {
      return `/admin/leads?leadId=${id}`;
    }
    if (normalizedType === 'account' && id) {
      return `/admin/accounts?highlight=${id}`;
    }
    if (normalizedType === 'order' && id) {
      return `/admin/orders?orderId=${id}`;
    }
    return '/admin/messages?type=reminder';
  }

  return undefined;
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const { unreadCount: contextUnreadCount, refresh: refreshContext } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'unread'>('all');
  const [notifType, setNotifType] = useState<AdminNotificationType>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reminderSummary, setReminderSummary] = useState<ReminderGroupPayload>({ total: 0, senders: [] });
  const [reminderSummaryLoading, setReminderSummaryLoading] = useState(false);
  const [reminderUnreadCount, setReminderUnreadCount] = useState(0);

  const load = useCallback(async (nextPage = page, nextStatus = status, nextType = notifType) => {
    setLoading(true);
    setError('');
    try {
      const query: NotificationQuery = {
        page: nextPage,
        pageSize: PAGE_SIZE,
        status: nextStatus,
      };

      // 如果选择了特定类型，添加到查询参数
      if (nextType !== 'all') {
        query.type = nextType;
      }

      const result = await listNotifications(query);
      setItems(result.items);
      setTotal(result.total);
      setUnreadCount(result.unreadCount);
      setPage(nextPage);
    } catch (err) {
      const text = err instanceof Error ? err.message : '消息列表加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, status, notifType]);

  /**
   * v1.3 SUP-3: 拉取按发送者分组的未读提醒摘要 + 总未读提醒数。
   * 该接口用于在主管消息中心顶部展示"X 人给你发了 N 条提醒"。
   */
  const loadReminderSummary = useCallback(async () => {
    setReminderSummaryLoading(true);
    try {
      const [group, unread] = await Promise.all([
        apiClient.get<ReminderGroupPayload>('/notifications/unread-by-sender').catch(() => null),
        getReminderUnreadCount().catch(() => ({ unreadCount: 0 })),
      ]);
      if (group) {
        setReminderSummary({
          total: Number(group.total || 0),
          senders: Array.isArray(group.senders) ? group.senders : [],
        });
      }
      setReminderUnreadCount(Number(unread.unreadCount || 0));
    } finally {
      setReminderSummaryLoading(false);
    }
  }, []);

  async function openNotification(item: NotificationItem) {
    // 标记已读
    if (item.unread) {
      try {
        await markNotificationRead(item.id);
      } catch (err) {
        message.warning(err instanceof Error ? err.message : '标记已读失败');
      }
    }

    // 跳转
    const routeHint = buildRouteHint(item);
    if (routeHint) {
      router.push(routeHint);
    } else {
      // 刷新列表
      await load(page, status, notifType);
    }
  }

  async function readAll() {
    try {
      await markAllNotificationsRead();
      message.success('已全部标记为已读');
      await load(1, status, notifType);
      await refreshContext();
      await loadReminderSummary();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记全部已读失败');
    }
  }

  function jumpToReminderList() {
    setNotifType('reminder');
    setStatus('unread');
    setPage(1);
  }

  useEffect(() => {
    void load(1, status, notifType);
    void loadReminderSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, notifType]);

  // 状态变化时重置页码
  const handleStatusChange = (value: 'all' | 'unread') => {
    setStatus(value);
    setPage(1);
  };

  const handleTypeChange = (value: AdminNotificationType) => {
    setNotifType(value);
    setPage(1);
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>消息中心</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看协同超时、员工低更新、客资积压、账号异常、导出完成以及跨端口互相提醒。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {/* 消息类型筛选 */}
          <Select<AdminNotificationType>
            value={notifType}
            onChange={handleTypeChange}
            options={ADMIN_NOTIFICATION_TYPES}
            style={{ width: 160 }}
            placeholder="消息类型"
          />
          {/* 已读/未读筛选 */}
          <Segmented
            value={status}
            onChange={(value) => handleStatusChange(value as 'all' | 'unread')}
            options={[
              { label: '全部', value: 'all' },
              {
                label: (
                  <Badge count={contextUnreadCount} size="small" offset={[6, -2]}>
                    <span style={{ paddingRight: 8 }}>未读</span>
                  </Badge>
                ),
                value: 'unread',
              },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { void load(); void loadReminderSummary(); }} loading={loading}>
            刷新
          </Button>
          <Button icon={<CheckOutlined />} onClick={readAll} disabled={!unreadCount}>
            全部已读
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      {/* v1.3 SUP-3: 跨端口提醒聚合卡（仅当存在未读提醒时展示） */}
      {reminderUnreadCount > 0 ? (
        <Card size="small">
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }} align="center">
            <Space wrap align="center">
              <Badge count={reminderUnreadCount} offset={[-2, 4]} overflowCount={99}>
                <Tag color="cyan" icon={<BellOutlined />}>
                  跨端口提醒
                </Tag>
              </Badge>
              <Typography.Text type="secondary">
                收到 <Typography.Text strong>{reminderSummary.senders.length}</Typography.Text> 位发送者
                共 <Typography.Text strong>{reminderSummary.total}</Typography.Text> 条未读提醒
              </Typography.Text>
            </Space>
            <Button type="link" size="small" onClick={jumpToReminderList}>
              查看全部
            </Button>
          </Space>
          {reminderSummary.senders.length > 0 ? (
            <Space wrap style={{ marginTop: 8 }}>
              {reminderSummary.senders.slice(0, 6).map((s) => (
                <Tooltip
                  key={s.senderId || s.senderName}
                  title={
                    s.latestContent
                      ? `${s.latestContent.slice(0, 80)}${s.latestContent.length > 80 ? '…' : ''}`
                      : '暂无内容预览'
                  }
                >
                  <Tag color="blue" style={{ cursor: 'pointer' }} onClick={jumpToReminderList}>
                    {s.senderName} × {s.count}
                  </Tag>
                </Tooltip>
              ))}
              {reminderSummary.senders.length > 6 ? (
                <Tag onClick={jumpToReminderList} style={{ cursor: 'pointer' }}>
                  +{reminderSummary.senders.length - 6}
                </Tag>
              ) : null}
            </Space>
          ) : reminderSummaryLoading ? (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              正在加载发送者列表…
            </Typography.Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        {items.length ? (
          <List
            loading={loading}
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className={`notification-list-item${item.unread ? ' unread' : ''}`}
                actions={[
                  <Button
                    key="action"
                    type={item.unread ? 'primary' : 'default'}
                    size="small"
                    onClick={() => openNotification(item)}
                  >
                    {item.unread ? '查看并已读' : '查看'}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      {item.notificationType === 'reminder' ? (
                        <Tag color="cyan" icon={<BellOutlined />}>
                          跨端口提醒
                        </Tag>
                      ) : (
                        <StatusTag kind="notificationType" code={item.notificationType} />
                      )}
                      <Typography.Text strong={item.unread}>{item.title}</Typography.Text>
                      {item.unread && <Badge status="processing" />}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4}>
                      {item.content ? (
                        <Typography.Text type="secondary" ellipsis={{ tooltip: item.content }}>
                          {item.content}
                        </Typography.Text>
                      ) : null}
                      <Space size={16}>
                        {item.targetType && (
                          <Tag>
                            {item.targetType === 'collaboration_task' && '协同任务'}
                            {item.targetType === 'lead' && '客资'}
                            {item.targetType === 'account' && '账号'}
                            {item.targetType === 'employee' && '员工'}
                            {item.targetType === 'post' && '作品'}
                            {item.targetType === 'order' && '订单'}
                            {!['collaboration_task', 'lead', 'account', 'employee', 'post', 'order'].includes(item.targetType) && item.targetType}
                            {item.targetId && ` #${item.targetId}`}
                          </Tag>
                        )}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDateTime(item.createdAt)}
                        </Typography.Text>
                      </Space>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description={
            notifType === 'reminder' ? '暂无跨端口提醒' :
            notifType === 'all' ? '暂无消息' :
            `暂无"${ADMIN_NOTIFICATION_TYPES.find(t => t.value === notifType)?.label}"类型的消息`
          } />
        )}
        <Pagination
          current={page}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={(nextPage) => load(nextPage, status, notifType)}
          style={{ marginTop: 16, textAlign: 'right' }}
          showSizeChanger={false}
        />
      </Card>
    </Space>
  );
}
