'use client';

import {
  CalendarOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  MessageOutlined,
  ScheduleOutlined,
  ShopOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Badge, Card, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getSalesHomeSummary, type SalesHomeSummary } from '@/shared/api/leads';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';

type CardConfig = {
  key: keyof SalesHomeSummary;
  title: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

const CARDS: CardConfig[] = [
  {
    key: 'newAssigned',
    title: '新分配',
    href: '/sales/leads?status=assigned',
    description: '主管刚分配给我、需要首次联系的客资',
    icon: <InboxOutlined />,
    accent: '#1677ff',
  },
  {
    key: 'pendingAdd',
    title: '待添加',
    href: '/sales/leads?status=pending_add',
    description: '已申请添加好友、等待客户通过的客资',
    icon: <UserAddOutlined />,
    accent: '#13c2c2',
  },
  {
    key: 'notPassed',
    title: '未通过',
    href: '/sales/leads?status=not_passed',
    description: '客户暂未通过好友申请，需要二次触达',
    icon: <ExclamationCircleOutlined />,
    accent: '#fa8c16',
  },
  {
    key: 'pendingCommunicate',
    title: '待沟通',
    href: '/sales/leads?status=communicating',
    description: '已添加好友、等待沟通报价的客资',
    icon: <UserSwitchOutlined />,
    accent: '#722ed1',
  },
  {
    key: 'todayFollowups',
    title: '今日待跟进',
    href: '/sales/followups',
    description: '今日需要复访、报价或推进的客户',
    icon: <CalendarOutlined />,
    accent: '#eb2f96',
  },
  {
    key: 'pendingOrders',
    title: '订单待处理',
    href: '/sales/orders',
    description: '成交后等待教务/客户确认的订单',
    icon: <ShopOutlined />,
    accent: '#52c41a',
  },
];

export default function SalesHomePage() {
  const [summary, setSummary] = useState<SalesHomeSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSalesHomeSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(undefined);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>销售首页</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看今日待办、新分配客资和订单进度，并快速进入对应工作台。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap>
          <Tag color="blue" icon={<UserSwitchOutlined />}>
            {user?.name ?? '当前销售'}
          </Tag>
          <Link href="/sales/messages">
            <Badge count={unreadCount} offset={[-2, 6]} overflowCount={99}>
              <Tag color={unreadCount > 0 ? 'red' : 'default'} icon={<MessageOutlined />}>
                未读消息
              </Tag>
            </Badge>
          </Link>
          <Link href="/sales/followups">
            <Tag color="purple" icon={<ScheduleOutlined />}>
              快捷筛选 · 今日跟进
            </Tag>
          </Link>
        </Space>
      </div>

      <Skeleton loading={loading} active paragraph={{ rows: 4 }}>
        <div className="metric-grid">
          {CARDS.map((card) => {
            const value = summary ? summary[card.key] : 0;
            return (
              <Link key={card.key} href={card.href}>
                <Card hoverable styles={{ body: { padding: 20 } }}>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 20 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Statistic value={value} valueStyle={{ color: card.accent }} />
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Link>
            );
          })}
        </div>
      </Skeleton>
    </Space>
  );
}
