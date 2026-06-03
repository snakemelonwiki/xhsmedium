'use client';

import {
  BellOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FormOutlined,
  ProjectOutlined,
  ShoppingOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Badge, Card, Col, List, Row, Segmented, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';

type Period = 'today' | 'week' | 'month';

type CollabTask = {
  id: string;
  leadId: string;
  type: string;
  reason?: string | null;
  customerName?: string | null;
  createdAt?: string;
};

type Notification = {
  id: string;
  title: string;
  content?: string | null;
  createdAt?: string;
  relatedType?: string | null;
  relatedId?: string | null;
};

type DashboardSummary = {
  xhsPosts?: number;
  douyinPosts?: number;
  todayLeads?: number;
  todayDeals?: number;
  pendingCollabs?: number;
};

type SummaryStats = {
  posts: number;
  leads: number;
  deals: number;
  pendingCollabs: number;
};

/**
 * 运营端"今日任务"页面：聚合今日要做的事——待处理协同、新分配客资、未读提醒、今日产能小计。
 */
export default function OperationTodayTasksPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [pendingCollabs, setPendingCollabs] = useState<CollabTask[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({ posts: 0, leads: 0, deals: 0, pendingCollabs: 0 });
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [collabs, notifications, summary, leadStats] = await Promise.all([
        apiClient.get<any>('/collaboration-tasks', { query: { scope: 'inbox', status: 'pending', limit: 20 } }).catch(() => null),
        apiClient.get<any>('/notifications', { query: { read: 0, limit: 10 } }).catch(() => null),
        apiClient.get<DashboardSummary>('/dashboard/summary', { query: { period } }).catch(() => null),
        apiClient.get<any>('/leads/stats', { query: { scope: 'self', period } }).catch(() => null),
      ]);

      // 协同任务
      const collabList = collabs?.items ?? collabs ?? [];
      setPendingCollabs(Array.isArray(collabList) ? collabList.slice(0, 10) : []);

      // 未读通知
      const notifList = notifications?.items ?? notifications?.notifications ?? notifications ?? [];
      setUnreadNotifications(Array.isArray(notifList) ? notifList.slice(0, 10) : []);

      // 今日汇总
      if (summary) {
        setSummaryStats({
          posts: Number(summary.xhsPosts || 0) + Number(summary.douyinPosts || 0),
          leads: Number(summary.todayLeads || 0),
          deals: Number(summary.todayDeals || 0),
          pendingCollabs: Number(summary.pendingCollabs || 0),
        });
      } else {
        setSummaryStats({ posts: 0, leads: 0, deals: 0, pendingCollabs: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const todayUrl = encodeURIComponent(new Date().toISOString().split('T')[0]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>今日任务</Typography.Title>
          <Typography.Paragraph type="secondary">
            快速处理协同、客资和待办事项。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap>
          <Tag color="blue">{user?.name ?? '运营'}</Tag>
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
            <Card><Statistic title="今日作品" value={summaryStats.posts} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="今日客资" value={summaryStats.leads} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="待处理协同" value={summaryStats.pendingCollabs} /></Card>
          </Col>
          <Col span={6}>
            <Card><Statistic title="今日成交" value={summaryStats.deals} /></Card>
          </Col>
        </Row>
      </Skeleton>

      <Row gutter={16}>
        {/* 待处理协同任务 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <ProjectOutlined />
                待处理协同任务
              </Space>
            }
            extra={<Link href="/operation/collaboration">查看全部</Link>}
          >
            {pendingCollabs.length > 0 ? (
              <List
                size="small"
                dataSource={pendingCollabs}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Link href="/operation/collaboration">
                          {item.customerName || item.leadId?.slice(0, 8) || '未知'} · {item.type}
                        </Link>
                      }
                      description={item.reason || '无备注'}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Typography.Text type="secondary">协同 inbox 已清空</Typography.Text>
            )}
          </Card>
        </Col>

        {/* 今日新分配客资 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <UsergroupAddOutlined />
                今日新分配客资
              </Space>
            }
            extra={<Link href={`/operation/leads?from=${todayUrl}&to=${todayUrl}`}>查看全部</Link>}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                跳转到客资看板，筛选今日录入的客资记录。
              </Typography.Paragraph>
              <Link href={`/operation/leads?from=${todayUrl}&to=${todayUrl}`}>
                <Tag color="blue" icon={<DatabaseOutlined />}>查看今日录入客资</Tag>
              </Link>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 主管建议/未读消息 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <BellOutlined />
                主管建议/未读消息
              </Space>
            }
            extra={<Link href="/operation/messages">查看消息中心</Link>}
          >
            {unreadNotifications.length > 0 ? (
              <List
                size="small"
                dataSource={unreadNotifications.slice(0, 5)}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Typography.Text strong>{item.title}</Typography.Text>}
                      description={
                        <Space direction="vertical" size={0}>
                          <span>{item.content || '-'}</span>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {item.createdAt}
                          </Typography.Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Typography.Text type="secondary">暂无未读提醒</Typography.Text>
            )}
          </Card>
        </Col>

        {/* 未完成录入 */}
        <Col span={12}>
          <Card
            title={
              <Space>
                <FileTextOutlined />
                未完成录入
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                快速进入录入页面，继续未完成的录入工作。
              </Typography.Paragraph>
              <Space wrap>
                <Link href="/operation/posts/new">
                  <Tag color="blue" icon={<FormOutlined />}>作品录入</Tag>
                </Link>
                <Link href="/operation/leads/new">
                  <Tag color="green" icon={<UsergroupAddOutlined />}>客资录入</Tag>
                </Link>
                <Link href="/operation/posts">
                  <Tag color="purple" icon={<ShoppingOutlined />}>我的作品</Tag>
                </Link>
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
