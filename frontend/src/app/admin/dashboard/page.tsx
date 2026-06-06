'use client';

import {
  BellOutlined,
  CheckOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  IdcardOutlined,
  OrderedListOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  List,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
  message as antdMessage,
} from 'antd';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getSupervisorOverview, type SupervisorOverview } from '@/shared/api/admin';
import { listNotifications } from '@/shared/api/notifications';
import { getReminderUnreadCount, markReminderRead } from '@/shared/api/reminders';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';
import type { NotificationItem } from '@/shared/types/notifications';
import { formatDateTime } from '@/shared/utils/date-format';

type Period = 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
};

type DataCard = {
  key: keyof Pick<SupervisorOverview, 'postCount' | 'leadCount' | 'likes' | 'effectiveAccountCount'>;
  title: string;
  icon: React.ReactNode;
  accent: string;
  description: string;
};

const DATA_CARDS: DataCard[] = [
  {
    key: 'postCount',
    title: '作品数',
    icon: <OrderedListOutlined />,
    accent: '#1677ff',
    description: '统计周期内发布的作品总数',
  },
  {
    key: 'leadCount',
    title: '客资数',
    icon: <UserSwitchOutlined />,
    accent: '#13c2c2',
    description: '统计周期内新增的客资数量',
  },
  {
    key: 'likes',
    title: '点赞数',
    icon: <FileSearchOutlined />,
    accent: '#722ed1',
    description: '统计周期内作品获得的点赞总和',
  },
  {
    key: 'effectiveAccountCount',
    title: '有效账号数',
    icon: <IdcardOutlined />,
    accent: '#eb2f96',
    description: '统计周期内有更新的账号数量',
  },
];

type ExceptionCard = {
  key: keyof SupervisorOverview['riskReminders'];
  title: string;
  icon: React.ReactNode;
  accent: string;
  href: string;
  description: string;
};

const EXCEPTION_CARDS: ExceptionCard[] = [
  {
    key: 'collaborationTimeout',
    title: '协同超时数',
    icon: <WarningOutlined />,
    accent: '#f5222d',
    href: '/admin/collaboration',
    description: '待处理协同任务中有超时风险的项',
  },
  {
    key: 'leadBacklog',
    title: '客资积压数',
    icon: <UserSwitchOutlined />,
    accent: '#fa8c16',
    href: '/admin/leads',
    description: '未成交客资中需要跟进的项',
  },
  {
    key: 'lowUpdateEmployees',
    title: '员工低更新数',
    icon: <TeamOutlined />,
    accent: '#faad14',
    href: '/admin/personal',
    description: '本周无作品更新的员工数量',
  },
  {
    key: 'abnormalAccounts',
    title: '账号异常数',
    icon: <SafetyCertificateOutlined />,
    accent: '#f5222d',
    href: '/admin/accounts',
    description: '账号状态异常需要处理的数量',
  },
];

const QUICK_ENTRIES = [
  {
    title: '员工管理',
    description: '维护员工资料、账号分配和在职状态。',
    href: '/admin/employees',
    icon: <TeamOutlined />,
  },
  {
    title: '账号管理',
    description: '管理运营账号、平台绑定与定位信息。',
    href: '/admin/accounts',
    icon: <IdcardOutlined />,
  },
  {
    title: '导出中心',
    description: '创建并下载作品、客资、排行榜和账号数据。',
    href: '/admin/exports',
    icon: <DashboardOutlined />,
  },
];

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [overview, setOverview] = useState<SupervisorOverview | undefined>();
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  // v1.3 SUP-3: 主管端顶部"消息中心"（跨端口提醒）
  // - GET /api/reminders/unread-count → 红点 + 未读数
  // - /api/notifications?type=reminder → 列表
  // - PATCH /api/reminders/:id/read → 标记已读
  // - Socket.IO 监听 reminder.created（与 notification.created 复用同一通道），
  //   收到推送后立即刷新计数与列表
  const token =
    typeof window === 'undefined' ? null : window.localStorage.getItem('xhsmedium.token');
  const { onMessage: onSocketMessage } = useNotificationSocket({
    token,
    userId: user?.id ?? null,
  });
  const [reminderUnread, setReminderUnread] = useState(0);
  const [reminderItems, setReminderItems] = useState<NotificationItem[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);

  const fetchOverview = useCallback((p: Period) => {
    setLoading(true);
    getSupervisorOverview(p)
      .then(setOverview)
      .catch(() => setOverview(undefined))
      .finally(() => setLoading(false));
  }, []);

  // 拉取提醒未读数 + 列表
  const loadReminders = useCallback(async () => {
    setReminderLoading(true);
    try {
      const [unread, list] = await Promise.all([
        getReminderUnreadCount().catch(() => ({ unreadCount: 0 })),
        listNotifications({ pageSize: 8, type: 'reminder' }).catch(() => ({ items: [] as NotificationItem[] })),
      ]);
      setReminderUnread(Number(unread.unreadCount || 0));
      setReminderItems(Array.isArray(list.items) ? list.items : []);
    } finally {
      setReminderLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(period);
  }, [period, fetchOverview]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  // 监听 Socket.IO 推送：reminder.created 事件（新提醒到达时刷新）
  useEffect(() => {
    const unsubscribe = onSocketMessage((raw) => {
      const type =
        String(
          (raw as any).typeCode ??
            (raw as any).notificationType ??
            (raw as any).type ??
            '',
        ).toLowerCase();
      if (type === 'reminder') {
        void loadReminders();
      }
    });
    return unsubscribe;
  }, [onSocketMessage, loadReminders]);

  // 标记单条已读
  const handleMarkReminderRead = useCallback(
    async (id: string | number) => {
      try {
        await markReminderRead(String(id));
        setReminderItems((prev) =>
          prev.map((it) => (String(it.id) === String(id) ? { ...it, unread: false } : it)),
        );
        setReminderUnread((n) => Math.max(0, n - 1));
      } catch (err) {
        antdMessage.warning(err instanceof Error ? err.message : '标记已读失败');
      }
    },
    [],
  );

  // 消息中心下拉内容
  const reminderDropdown = (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
        padding: 12,
        width: 360,
        maxHeight: 420,
        overflow: 'auto',
      }}
    >
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
        align="center"
      >
        <Typography.Text strong>消息中心 - 跨端口提醒</Typography.Text>
        <Badge count={reminderUnread} size="small" overflowCount={99}>
          <Tag color={reminderUnread > 0 ? 'cyan' : 'default'}>未读 {reminderUnread}</Tag>
        </Badge>
      </Space>
      {reminderLoading && reminderItems.length === 0 ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : reminderItems.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无提醒" />
      ) : (
        <List
          size="small"
          dataSource={reminderItems}
          renderItem={(item) => (
            <List.Item
              style={{ padding: '6px 0' }}
              actions={
                item.unread
                  ? [
                      <Button
                        key="read"
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={() => void handleMarkReminderRead(item.id)}
                      >
                        标记已读
                      </Button>,
                    ]
                  : []
              }
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space size={4} align="center">
                  {item.unread ? <Badge status="processing" /> : null}
                  <Typography.Text strong={Boolean(item.unread)}>{item.title}</Typography.Text>
                </Space>
                {item.content ? (
                  <Typography.Text type="secondary" ellipsis={{ tooltip: item.content }}>
                    {item.content}
                  </Typography.Text>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {formatDateTime(item.createdAt)}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      )}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Link href="/admin/messages">
          <Button type="link" size="small">
            查看全部 <RightOutlined />
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* Toolbar */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管总览</Typography.Title>
          <Typography.Paragraph type="secondary">
            从全局视角监控作品、客资、流量与运营风险。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap align="center">
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={[
              { label: '今日', value: 'today' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
            ]}
          />
          <Tag color="purple" icon={<TeamOutlined />}>
            {user?.name ?? '主管'}
          </Tag>
          {/* v1.3 SUP-3: 顶部消息中心 — 红点为 reminder 未读数；点击展开提醒列表并支持标记已读 */}
          <Dropdown
            popupRender={() => reminderDropdown}
            trigger={['click']}
            placement="bottomRight"
          >
            <Badge count={reminderUnread} offset={[-2, 6]} overflowCount={99}>
              <Tag
                color={reminderUnread > 0 ? 'cyan' : 'default'}
                icon={<BellOutlined />}
                style={{ cursor: 'pointer' }}
              >
                消息中心
              </Tag>
            </Badge>
          </Dropdown>
          <Link href="/admin/messages">
            <Badge count={unreadCount} offset={[-2, 6]} overflowCount={99}>
              <Tag color={unreadCount > 0 ? 'red' : 'default'} icon={<BellOutlined />}>
                未读消息
              </Tag>
            </Badge>
          </Link>
        </Space>
      </div>

      {/* 4 Data Cards */}
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        <Row gutter={[16, 16]}>
          {DATA_CARDS.map((card) => {
            const value = overview ? overview[card.key] : 0;
            return (
              <Col xs={24} sm={12} lg={6} key={card.key}>
                <Card>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 20 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Statistic value={value} valueStyle={{ color: card.accent }} />
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      {PERIOD_LABELS[period]}：{card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Skeleton>

      {/* 4 Exception Cards */}
      <div>
        <Typography.Title level={4}>
          <ExclamationCircleOutlined style={{ color: '#f5222d', marginRight: 8 }} />
          异常提醒
        </Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {EXCEPTION_CARDS.map((card) => {
          const value = overview?.riskReminders[card.key] ?? 0;
          return (
            <Col xs={24} sm={12} lg={6} key={card.key}>
              <Link href={card.href}>
                <Card
                  hoverable
                  styles={{ body: { padding: 16 } }}
                  style={{
                    borderColor: value > 0 ? card.accent : undefined,
                    borderWidth: value > 0 ? 2 : 1,
                  }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 18 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Statistic
                      value={value}
                      valueStyle={{ color: value > 0 ? card.accent : undefined }}
                    />
                    <Typography.Paragraph
                      type="secondary"
                      style={{ marginBottom: 0, fontSize: 12 }}
                    >
                      {card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Link>
            </Col>
          );
        })}
      </Row>

      {/* 3 Quick Entries */}
      <div>
        <Typography.Title level={4}>快捷入口</Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {QUICK_ENTRIES.map((entry) => (
          <Col xs={24} md={8} key={entry.href}>
            <Link href={entry.href}>
              <Card hoverable>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      <Space>
                        {entry.icon}
                        {entry.title}
                      </Space>
                    </Typography.Title>
                    <RightOutlined />
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {entry.description}
                  </Typography.Paragraph>
                </Space>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
