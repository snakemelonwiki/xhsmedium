'use client';

import {
  BellOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  InboxOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PlayCircleOutlined,
  RightOutlined,
  ScheduleOutlined,
  UserAddOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Badge, Card, Col, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAcademicHomeSummary, type AcademicHomeSummary } from '@/shared/api/orders';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';

type MetricCard = {
  key: keyof AcademicHomeSummary;
  title: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

const METRIC_CARDS: MetricCard[] = [
  {
    key: 'pendingReceive',
    title: '待接收',
    href: '/academic/orders?scope=pool&status=to_receive',
    description: '订单池中等待教务接单的最新成交单',
    icon: <InboxOutlined />,
    accent: '#1677ff',
  },
  {
    key: 'inProgress',
    title: '进行中',
    href: '/academic/orders?scope=academic&status=in_progress',
    description: '已认领、正在履约过程中的订单',
    icon: <PlayCircleOutlined />,
    accent: '#13c2c2',
  },
  {
    key: 'waitingMaterial',
    title: '待客户资料',
    href: '/academic/orders?scope=academic&status=awaiting_client_info',
    description: '等客户提交资料 / 补充信息的订单',
    icon: <FileSearchOutlined />,
    accent: '#722ed1',
  },
  {
    key: 'waitingTeacher',
    title: '待老师安排',
    href: '/academic/orders?scope=academic&status=awaiting_teacher',
    description: '等老师档期 / 排课的订单',
    icon: <UserAddOutlined />,
    accent: '#eb2f96',
  },
  {
    key: 'nearDue',
    title: '即将到期',
    href: '/academic/orders?scope=academic&status=near_due',
    description: '5 天内无进展、需重点跟进的订单',
    icon: <ClockCircleOutlined />,
    accent: '#fa8c16',
  },
  {
    key: 'abnormal',
    title: '异常订单',
    href: '/academic/abnormal',
    description: '已转异常的订单，集中处理回正常流程',
    icon: <ExclamationCircleOutlined />,
    accent: '#f5222d',
  },
];

const QUICK_ENTRIES = [
  {
    title: '订单池',
    description: '查看待领取与进行中的履约订单。',
    href: '/academic/orders',
    icon: <OrderedListOutlined />,
  },
  {
    title: '异常订单',
    description: '集中处理异常状态订单并推进回正常流程。',
    href: '/academic/abnormal',
    icon: <ExclamationCircleOutlined />,
  },
  {
    title: '消息',
    description: '查看成交通知、异常提醒与履约协作消息。',
    href: '/academic/messages',
    icon: <BellOutlined />,
  },
];

export default function AcademicHomePage() {
  const [summary, setSummary] = useState<AcademicHomeSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAcademicHomeSummary()
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
          <Typography.Title level={2}>教务首页</Typography.Title>
          <Typography.Paragraph type="secondary">
            从订单池接单，优先处理异常，并同步查看订单消息与节点提醒。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap>
          <Tag color="cyan" icon={<UserSwitchOutlined />}>
            {user?.name ?? '当前教务'}
          </Tag>
          <Link href="/academic/messages">
            <Badge count={unreadCount} offset={[-2, 6]} overflowCount={99}>
              <Tag color={unreadCount > 0 ? 'red' : 'default'} icon={<MessageOutlined />}>
                未读消息
              </Tag>
            </Badge>
          </Link>
          <Link href="/academic/reminders">
            <Tag color="purple" icon={<ScheduleOutlined />}>
              节点提醒
            </Tag>
          </Link>
        </Space>
      </div>

      <Skeleton loading={loading} active paragraph={{ rows: 4 }}>
        <div className="metric-grid">
          {METRIC_CARDS.map((card) => {
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

      <div>
        <Typography.Title level={4}>快捷入口</Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {QUICK_ENTRIES.map((card) => (
          <Col xs={24} md={8} key={card.href}>
            <Link href={card.href}>
              <Card hoverable>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      <Space>
                        {card.icon}
                        {card.title}
                      </Space>
                    </Typography.Title>
                    <RightOutlined />
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {card.description}
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
