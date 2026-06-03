'use client';

import {
  CheckCircleFilled,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  List,
  Pagination,
  Segmented,
  Space,
  Tag,
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
import { StatusTag } from '@/shared/components/status';
import type { NotificationItem } from '@/shared/types/notifications';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import { formatDateTime } from '@/shared/utils/date-format';

// 运营端关注的消息类型
const OPERATION_NOTIFICATION_TYPES = [
  { value: 'all', label: '全部' },
  { value: 'collaboration_requested', label: '协同申请' },
  { value: 'customer_not_passed', label: '客户未通过' },
  { value: 'customer_added', label: '客户已添加' },
  { value: 'supervisor_suggestion', label: '主管建议' },
];

// 消息类型到跳转路由的映射
function getJumpRoute(item: NotificationItem): string | undefined {
  const { notificationType, targetType, targetId } = item;

  // 协同申请 -> 跳转协同处理页
  if (notificationType === 'collaboration_requested') {
    if (targetType === 'collaboration' || targetType === 'collaboration_task') {
      return `/operation/collaboration${targetId ? `?taskId=${targetId}` : ''}`;
    }
    return '/operation/collaboration';
  }

  // 客户未通过 -> 跳转协同处理页
  if (notificationType === 'customer_not_passed') {
    if (targetType === 'collaboration' || targetType === 'collaboration_task') {
      return `/operation/collaboration${targetId ? `?taskId=${targetId}` : ''}`;
    }
    return '/operation/collaboration';
  }

  // 销售已添加通过 -> 跳转客资看板
  if (notificationType === 'customer_added') {
    if (targetType === 'lead') {
      return `/operation/leads?leadId=${targetId}`;
    }
    return '/operation/leads';
  }

  // 主管建议 -> 跳转账号管理页
  if (notificationType === 'supervisor_suggestion') {
    if (targetType === 'account' && targetId) {
      return `/operation/accounts?highlight=${targetId}`;
    }
    if (targetType === 'post' && targetId) {
      return `/operation/posts?highlight=${targetId}`;
    }
    return '/operation/accounts';
  }

  // 客资相关 -> 跳转客资看板
  if (targetType === 'lead' && targetId) {
    return `/operation/leads?leadId=${targetId}`;
  }

  // 协同任务 -> 跳转协同处理页
  if ((targetType === 'collaboration' || targetType === 'collaboration_task') && targetId) {
    return `/operation/collaboration?taskId=${targetId}`;
  }

  // 作品 -> 跳转作品页
  if (targetType === 'post' && targetId) {
    return `/operation/posts?highlight=${targetId}`;
  }

  return undefined;
}

// 判断消息是否属于运营端关注类型
function isOperationRelevantType(type: string): boolean {
  const relevantTypes = [
    'collaboration_requested',
    'customer_not_passed',
    'customer_added',
    'supervisor_suggestion',
  ];
  return relevantTypes.includes(type);
}

/**
 * 运营端消息中心
 * - 顶部：未读数 Badge + 全部已读按钮 + 类型筛选
 * - 列表：消息类型 Tag、标题、内容、时间、已读/未读
 * - 点击单条消息标记已读 + 跳转目标
 * - WebSocket 实时（通过 NotificationContext）
 */
export default function OperationMessagesPage() {
  const router = useRouter();
  const { unreadCount, refresh: refreshContext } = useNotifications();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pageSize = 20;

  async function load(nextPage = page, nextType = typeFilter) {
    setLoading(true);
    setError('');
    try {
      const query: NotificationQuery = {
        page: nextPage,
        pageSize,
      };
      if (nextType !== 'all') {
        query.type = nextType;
      }
      const result = await listNotifications(query);
      // 运营端只展示关注的消息类型
      const filteredItems = nextType === 'all'
        ? result.items.filter(item => isOperationRelevantType(item.notificationType))
        : result.items;
      setItems(filteredItems);
      setTotal(nextType === 'all' ? filteredItems.length : result.total);
      setPage(nextPage);
    } catch (err) {
      const text = err instanceof Error ? err.message : '消息列表加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

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
    const route = getJumpRoute(item);
    if (route) {
      router.push(route);
    } else {
      // 没有跳转目标时刷新列表
      await load(page, typeFilter);
    }
  }

  async function readAll() {
    try {
      await markAllNotificationsRead();
      message.success('已全部标记为已读');
      await load(1, typeFilter);
      await refreshContext();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记全部已读失败');
    }
  }

  async function handleTypeChange(value: string) {
    setTypeFilter(value);
    setPage(1);
    await load(1, value);
  }

  // 监听筛选变化
  useEffect(() => {
    void load(1, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算当前筛选条件下的未读数
  const currentUnreadCount = typeFilter === 'all'
    ? items.filter(i => i.unread).length
    : unreadCount;

  // 获取类型的显示颜色
  const getTypeTagColor = (type: string): string => {
    switch (type) {
      case 'collaboration_requested':
        return 'purple';
      case 'customer_not_passed':
        return 'orange';
      case 'customer_added':
        return 'green';
      case 'supervisor_suggestion':
        return 'blue';
      default:
        return 'default';
    }
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 顶部标题栏 */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>
            <Space>
              消息中心
              {unreadCount > 0 && <Badge count={unreadCount} overflowCount={99} style={{ backgroundColor: '#ff4d4f' }} />}
            </Space>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            协同申请、客户未通过、销售已添加通过和主管建议提醒。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {/* 类型筛选 */}
          <Segmented
            value={typeFilter}
            onChange={(value) => handleTypeChange(String(value))}
            options={OPERATION_NOTIFICATION_TYPES}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>刷新</Button>
          <Button
            icon={<CheckOutlined />}
            onClick={readAll}
            disabled={!currentUnreadCount}
            type="primary"
          >
            全部已读
          </Button>
        </Space>
      </div>

      {/* 错误提示 */}
      {error ? <Alert type="warning" showIcon message={error} /> : null}

      {/* 消息列表 */}
      <Card>
        {items.length > 0 ? (
          <List
            loading={loading}
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className={`notification-list-item ${item.unread ? 'notification-unread' : ''}`}
                style={{
                  backgroundColor: item.unread ? '#f0f5ff' : undefined,
                  padding: '12px 16px',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
                actions={[
                  item.unread ? (
                    <Button
                      key="read"
                      size="small"
                      type="primary"
                      icon={<CheckCircleFilled />}
                      onClick={() => openNotification(item)}
                    >
                      查看并已读
                    </Button>
                  ) : (
                    <Button
                      key="open"
                      size="small"
                      onClick={() => openNotification(item)}
                    >
                      查看
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  title={(
                    <Space wrap>
                      <Tag color={getTypeTagColor(item.notificationType)}>
                        {OPERATION_NOTIFICATION_TYPES.find(t => t.value === item.notificationType)?.label ||
                          item.notificationType}
                      </Tag>
                      <Typography.Text strong={item.unread} style={{ fontSize: 15 }}>
                        {item.title}
                      </Typography.Text>
                    </Space>
                  )}
                  description={(
                    <Space direction="vertical" size={4}>
                      {item.content && (
                        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 500 }}>
                          {item.content}
                        </Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(item.createdAt)}
                      </Typography.Text>
                    </Space>
                  )}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty
            description={
              typeFilter === 'all'
                ? '暂无消息通知'
                : `暂无"${OPERATION_NOTIFICATION_TYPES.find(t => t.value === typeFilter)?.label}"类型的消息`
            }
          />
        )}
        {items.length > 0 && (
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(nextPage) => load(nextPage, typeFilter)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        )}
      </Card>
    </Space>
  );
}
