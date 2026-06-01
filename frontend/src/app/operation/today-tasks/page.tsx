'use client';

import { Card, Empty, List, Space, Statistic, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type CollabTask = { id: string; leadId: string; type: string; reason?: string | null; customerName?: string | null };
type Notification = { id: string; title: string; content?: string | null; createdAt?: string; relatedType?: string | null; relatedId?: string | null };
type Stats = { total?: number; byProcessStatus?: Record<string, number> };

/**
 * 运营端"今日任务"页面：聚合今日要做的事——待处理协同、新分配客资、未读提醒、今日产能小计。
 * 后端目前没有专属 today-tasks 聚合接口，前端组合 dashboard/leads/collab/notification 现有接口拼出。
 */
export default function OperationTodayTasksPage() {
  const [pendingCollabs, setPendingCollabs] = useState<CollabTask[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [todaySummary, setTodaySummary] = useState<{ posts: number; leads: number; deals: number }>();
  const [leadStats, setLeadStats] = useState<Stats>();

  useEffect(() => {
    void Promise.all([
      apiClient.get<any>('/collaboration-tasks', { query: { scope: 'inbox', status: 'pending', limit: 20 } }).catch(() => null),
      apiClient.get<any>('/notifications', { query: { read: 0, limit: 10 } }).catch(() => null),
      apiClient.get<any>('/dashboard/summary').catch(() => null),
      apiClient.get<any>('/leads/stats', { query: { scope: 'self', period: 'today' } }).catch(() => null),
    ]).then(([collabs, notifications, summary, stats]) => {
      const collabList = collabs?.items ?? collabs ?? [];
      setPendingCollabs(Array.isArray(collabList) ? collabList.slice(0, 10) : []);
      const notifList = notifications?.items ?? notifications?.notifications ?? notifications ?? [];
      setUnreadNotifications(Array.isArray(notifList) ? notifList.slice(0, 10) : []);
      if (summary && typeof summary === 'object') {
        setTodaySummary({
          posts: Number(summary.xhsPosts || 0) + Number(summary.douyinPosts || 0),
          leads: Number(summary.todayLeads || 0),
          deals: Number(summary.todayDeals || 0),
        });
      }
      if (stats && typeof stats === 'object') setLeadStats(stats);
    });
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>今日任务</Typography.Title>
        <Typography.Paragraph type="secondary">今天需要处理的协同、提醒和已完成产能概览。</Typography.Paragraph>
      </div>

      <div className="metric-grid">
        <Card><Statistic title="今日作品" value={todaySummary?.posts ?? 0} /></Card>
        <Card><Statistic title="今日客资" value={todaySummary?.leads ?? 0} /></Card>
        <Card><Statistic title="今日成交" value={todaySummary?.deals ?? 0} /></Card>
        <Card><Statistic title="协同待处理" value={pendingCollabs.length} /></Card>
      </div>

      <Card title="待处理协同任务" extra={<Link href="/operation/collaboration">查看全部</Link>}>
        {pendingCollabs.length > 0 ? (
          <List
            dataSource={pendingCollabs}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Link href="/operation/collaboration">
                      {item.customerName || item.leadId.slice(0, 8)} · {item.type}
                    </Link>
                  }
                  description={item.reason || '无备注'}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="协同 inbox 已清空" />
        )}
      </Card>

      <Card title="未读提醒" extra={<Link href="/operation/messages">查看消息中心</Link>}>
        {unreadNotifications.length > 0 ? (
          <List
            dataSource={unreadNotifications}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={item.title}
                  description={
                    <Space direction="vertical" size={0}>
                      <span>{item.content || '-'}</span>
                      <Typography.Text type="secondary">{item.createdAt}</Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无未读提醒" />
        )}
      </Card>

      {leadStats && leadStats.byProcessStatus ? (
        <Card title="自己客资分布（按处理状态）">
          <Space wrap size={16}>
            {Object.entries(leadStats.byProcessStatus).map(([k, v]) => (
              <Statistic key={k} title={k} value={v} />
            ))}
          </Space>
        </Card>
      ) : null}
    </Space>
  );
}
