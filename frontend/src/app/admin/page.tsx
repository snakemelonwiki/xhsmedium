'use client';

import {
  BarChartOutlined,
  BellOutlined,
  IdcardOutlined,
  LineChartOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Card, Statistic, Space, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAdminDashboardSummary } from '@/shared/api/admin';
import type { AdminDashboardSummary } from '@/shared/types/admin';

const entries = [
  { title: '客资管理', href: '/admin/leads', description: '查看全部客资、销售归属和跟进状态', icon: <UserSwitchOutlined /> },
  { title: '员工管理', href: '/admin/employees', description: '维护员工资料和在职状态', icon: <TeamOutlined /> },
  { title: '账号管理', href: '/admin/accounts', description: '管理运营账号、平台和定位信息', icon: <IdcardOutlined /> },
  { title: '基础分析', href: '/admin/analytics', description: '查看今日作品、流量和客资统计', icon: <BarChartOutlined /> },
  { title: '消息中心', href: '/admin/messages', description: '查看协同与系统通知', icon: <BellOutlined /> },
];

export default function AdminHomePage() {
  const [summary, setSummary] = useState<AdminDashboardSummary>();

  useEffect(() => {
    getAdminDashboardSummary().then(setSummary).catch(() => setSummary(undefined));
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>主管首页</Typography.Title>
        <Typography.Paragraph type="secondary">后台管理、全量客资和经营分析的统一入口。</Typography.Paragraph>
      </div>

      <div className="metric-grid">
        <Card><Statistic title="今日客资" value={summary?.todayLeads ?? 0} prefix={<UserSwitchOutlined />} /></Card>
        <Card><Statistic title="今日成交" value={summary?.todayDeals ?? 0} prefix={<LineChartOutlined />} /></Card>
        <Card><Statistic title="更新员工" value={summary?.updatedEmployees ?? 0} prefix={<TeamOutlined />} /></Card>
        <Card><Statistic title="更新账号" value={summary?.updatedAccounts ?? 0} prefix={<IdcardOutlined />} /></Card>
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
