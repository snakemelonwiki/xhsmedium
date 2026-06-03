'use client';

import {
  BellOutlined,
  DatabaseOutlined,
  ExportOutlined,
  FormOutlined,
  OrderedListOutlined,
  ProjectOutlined,
  ShopOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Badge, Card, Col, Row, Segmented, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';

type Period = 'today' | 'week' | 'month';

type DashboardSummary = {
  xhsPosts?: number;
  douyinPosts?: number;
  todayLeads?: number;
  todayDeals?: number;
  pendingCollabs?: number;
};

type EntryCard = {
  key: string;
  title: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

const ENTRY_CARDS: EntryCard[] = [
  {
    key: 'post-new',
    title: '作品录入',
    href: '/operation/posts/new',
    description: '补充作品链接、平台账号和封面截图',
    icon: <FormOutlined />,
    accent: '#1677ff',
  },
  {
    key: 'lead-new',
    title: '客资录入',
    href: '/operation/leads/new',
    description: '录入客户线索并确认销售分配',
    icon: <UsergroupAddOutlined />,
    accent: '#13c2c2',
  },
  {
    key: 'collaboration',
    title: '协同处理',
    href: '/operation/collaboration',
    description: '处理销售发起的来源、内容和跟进协同',
    icon: <ProjectOutlined />,
    accent: '#fa8c16',
  },
  {
    key: 'my-posts',
    title: '我的作品',
    href: '/operation/posts',
    description: '查看和管理自己录入的作品数据',
    icon: <OrderedListOutlined />,
    accent: '#722ed1',
  },
  {
    key: 'leads',
    title: '客资看板',
    href: '/operation/leads',
    description: '回看自己录入客资的分配和跟进状态',
    icon: <DatabaseOutlined />,
    accent: '#eb2f96',
  },
  {
    key: 'messages',
    title: '消息中心',
    href: '/operation/messages',
    description: '查看协同通知和系统提醒',
    icon: <BellOutlined />,
    accent: '#52c41a',
  },
];

export default function OperationHomePage() {
  const [period, setPeriod] = useState<Period>('today');
  const [summary, setSummary] = useState<DashboardSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<DashboardSummary>('/dashboard/summary', { query: { period } })
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
  }, [period]);

  const posts = (summary?.xhsPosts ?? 0) + (summary?.douyinPosts ?? 0);
  const leads = summary?.todayLeads ?? 0;
  const deals = summary?.todayDeals ?? 0;
  const pendingCollabs = summary?.pendingCollabs ?? 0;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>运营总览</Typography.Title>
          <Typography.Paragraph type="secondary">
            快速查看今日产能和待处理事项，并跳转对应工作台。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap>
          <Tag color="blue">当前角色：运营</Tag>
          <Link href="/operation/messages">
            <Badge count={unreadCount} offset={[-2, 6]} overflowCount={99}>
              <Tag color={unreadCount > 0 ? 'red' : 'default'} icon={<BellOutlined />}>
                未读消息
              </Tag>
            </Badge>
          </Link>
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={[
              { label: '今日', value: 'today' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
            ]}
          />
        </Space>
      </div>

      <Skeleton loading={loading} active paragraph={{ rows: 2 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Card><Statistic title="今日作品" value={posts} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="今日客资" value={leads} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="今日成交" value={deals} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="待处理协同" value={pendingCollabs} /></Card>
          </Col>
        </Row>
      </Skeleton>

      <div>
        <Typography.Title level={4}>快捷入口</Typography.Title>
        <Row gutter={[16, 16]}>
          {ENTRY_CARDS.map((card) => (
            <Col key={card.key} span={8}>
              <Link href={card.href}>
                <Card hoverable styles={{ body: { padding: 20 } }}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 20 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      {card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      </div>
    </Space>
  );
}
