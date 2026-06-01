'use client';

import { Card, Space, Statistic, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';

import { getAdminDashboardSummary, listAdminPostTypeDistribution, listAdminRankings } from '@/shared/api/admin';
import type { AdminDashboardSummary, AdminPostTypeDistribution, AdminRankingRow } from '@/shared/types/admin';

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<AdminDashboardSummary>();
  const [distribution, setDistribution] = useState<AdminPostTypeDistribution[]>([]);
  const [rankings, setRankings] = useState<AdminRankingRow[]>([]);

  useEffect(() => {
    getAdminDashboardSummary().then(setSummary).catch(() => setSummary(undefined));
    listAdminPostTypeDistribution().then(setDistribution).catch(() => setDistribution([]));
    listAdminRankings({ pageSize: 20 }).then((result) => setRankings(result.items)).catch(() => setRankings([]));
  }, []);

  const distributionColumns: TableColumnsType<AdminPostTypeDistribution> = [
    { title: '作品类型', dataIndex: 'type' },
    { title: '数量', dataIndex: 'count' },
    { title: '占比', dataIndex: 'ratio', render: (value?: string) => value || '-' },
  ];

  const rankingColumns: TableColumnsType<AdminRankingRow> = [
    { title: '员工', dataIndex: 'name' },
    { title: '账号数', dataIndex: 'accountCount' },
    { title: '今日作品', dataIndex: 'todayPosts' },
    { title: '今日客资', dataIndex: 'todayLeads' },
    { title: '今日流量', dataIndex: 'todayTraffic' },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>分析看板</Typography.Title>
        <Typography.Paragraph type="secondary">查看主管视角核心指标、作品类型分布和员工榜单。</Typography.Paragraph>
      </div>
      <div className="metric-grid">
        <Card><Statistic title="今日客资" value={summary?.todayLeads ?? 0} /></Card>
        <Card><Statistic title="今日成交" value={summary?.todayDeals ?? 0} /></Card>
        <Card><Statistic title="小红书流量" value={summary?.xhsTraffic ?? 0} /></Card>
        <Card><Statistic title="抖音流量" value={summary?.douyinTraffic ?? 0} /></Card>
      </div>
      <Card title="作品类型分布">
        <Table rowKey="type" columns={distributionColumns} dataSource={distribution} pagination={false} />
      </Card>
      <Card title="员工表现">
        <Table rowKey="employeeId" columns={rankingColumns} dataSource={rankings} pagination={false} />
      </Card>
    </Space>
  );
}
