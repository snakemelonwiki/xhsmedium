'use client';

import {
  BarChartOutlined,
  BellOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  IdcardOutlined,
  LineChartOutlined,
  OrderedListOutlined,
  ProjectOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Card, Segmented, Statistic, Space, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAdminDashboardSummary } from '@/shared/api/admin';
import type { AdminDashboardSummary } from '@/shared/types/admin';

const entries = [
  { title: '运营排行榜', href: '/admin/rankings', description: '查看员工运营结果与榜单排序', icon: <LineChartOutlined /> },
  { title: '个人看板', href: '/admin/personal', description: '查看员工个人作品、客资和流量表现', icon: <BarChartOutlined /> },
  { title: '作品看板', href: '/admin/posts', description: '查看全量作品、平台和互动数据', icon: <OrderedListOutlined /> },
  { title: '客资看板', href: '/admin/leads', description: '查看全部客资、销售归属和跟进状态', icon: <DatabaseOutlined /> },
  { title: '员工管理', href: '/admin/employees', description: '维护员工资料和在职状态', icon: <TeamOutlined /> },
  { title: '账号管理', href: '/admin/accounts', description: '管理运营账号、平台和定位信息', icon: <IdcardOutlined /> },
  { title: '分析看板', href: '/admin/analytics', description: '查看今日作品、流量和客资统计', icon: <BarChartOutlined /> },
  { title: '消息中心', href: '/admin/messages', description: '查看协同与系统通知', icon: <BellOutlined /> },
  { title: '导出中心', href: '/admin/exports', description: '创建并下载作品、客资、排行榜、订单和账号导出', icon: <ExportOutlined /> },
];

export default function AdminHomePage() {
  const [summary, setSummary] = useState<AdminDashboardSummary>();

  useEffect(() => {
    getAdminDashboardSummary().then(setSummary).catch(() => setSummary(undefined));
  }, []);

  const postCount = (summary?.xhsPosts ?? 0) + (summary?.douyinPosts ?? 0);
  const likeCount = (summary?.xhsLikes ?? 0) + (summary?.douyinLikes ?? 0);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-heading">
        <Space direction="vertical" size={8}>
          <Space wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>主管总览</Typography.Title>
            <Tag color="purple">当前角色：主管</Tag>
          </Space>
          <Segmented
            defaultValue="today"
            options={[
              { label: '今日', value: 'today' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
            ]}
          />
        </Space>
      </div>

      <div className="metric-grid">
        <Card><Statistic title="今日客资" value={summary?.todayLeads ?? 0} prefix={<UserSwitchOutlined />} /></Card>
        <Card><Statistic title="今日成交" value={summary?.todayDeals ?? 0} prefix={<LineChartOutlined />} /></Card>
        <Card><Statistic title="异常订单" value={summary?.abnormalOrders ?? 0} prefix={<WarningOutlined />} valueStyle={{ color: (summary?.abnormalOrders ?? 0) > 0 ? '#cf1322' : undefined }} /></Card>
        <Card><Statistic title="更新员工" value={summary?.updatedEmployees ?? 0} prefix={<TeamOutlined />} /></Card>
        <Card><Statistic title="更新账号" value={summary?.updatedAccounts ?? 0} prefix={<IdcardOutlined />} /></Card>
        <Card><Statistic title="作品数" value={postCount} prefix={<OrderedListOutlined />} /></Card>
        <Card><Statistic title="点赞数" value={likeCount} prefix={<LineChartOutlined />} /></Card>
        <Card><Statistic title="待处理协同" value={0} prefix={<ProjectOutlined />} /></Card>
        <Card><Statistic title="风险提醒" value={0} prefix={<ExclamationCircleOutlined />} /></Card>
      </div>

      <div className="metric-grid">
        {entries.map((entry) => (
          <Link key={entry.href} href={entry.href}>
            <Card hoverable>
              <Space direction="vertical" size={8}>
                <Typography.Title level={4}>{entry.icon} {entry.title}</Typography.Title>
                <Typography.Paragraph type="secondary">{entry.description}</Typography.Paragraph>
              </Space>
            </Card>
          </Link>
        ))}
      </div>
    </Space>
  );
}
