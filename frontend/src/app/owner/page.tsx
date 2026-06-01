'use client';

import {
  BarChartOutlined,
  BellOutlined,
  IdcardOutlined,
  LineChartOutlined,
  ProjectOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Card, Statistic, Space, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAdminDashboardSummary } from '@/shared/api/admin';
import type { AdminDashboardSummary } from '@/shared/types/admin';

/**
 * 总后台首页：owner 角色独立的着陆页，复用主管端聚合接口，强调"全局视图"。
 * 菜单与功能页面与 /admin 共用，避免重复维护两套实现。
 */
const entries = [
  { title: '主管总览', href: '/admin', description: '今日作品/客资/成交，运营主管全量视图', icon: <BarChartOutlined /> },
  { title: '客资看板', href: '/admin/leads', description: '查看全部客资、销售归属和跟进状态', icon: <UserSwitchOutlined /> },
  { title: '订单看板', href: '/admin/orders', description: '订单全量视图与教务分配', icon: <ProjectOutlined /> },
  { title: '员工管理', href: '/admin/employees', description: '维护员工资料和在职状态', icon: <TeamOutlined /> },
  { title: '账号管理', href: '/admin/accounts', description: '管理运营账号、平台和定位信息', icon: <IdcardOutlined /> },
  { title: '基础分析', href: '/admin/analytics', description: '查看流量与客资统计', icon: <LineChartOutlined /> },
  { title: '消息中心', href: '/admin/messages', description: '查看协同与系统通知', icon: <BellOutlined /> },
];

export default function OwnerHomePage() {
  const [summary, setSummary] = useState<AdminDashboardSummary>();

  useEffect(() => {
    getAdminDashboardSummary().then(setSummary).catch(() => setSummary(undefined));
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>总后台</Typography.Title>
        <Typography.Paragraph type="secondary">
          全局客资、来源作品和团队动作都集中在这里查看。owner 视角可访问主管端的全部功能页面。
        </Typography.Paragraph>
      </div>

      <div className="metric-grid">
        <Card><Statistic title="今日客资" value={summary?.todayLeads ?? 0} prefix={<UserSwitchOutlined />} /></Card>
        <Card><Statistic title="今日成交" value={summary?.todayDeals ?? 0} prefix={<LineChartOutlined />} /></Card>
        <Card><Statistic title="异常订单" value={summary?.abnormalOrders ?? 0} prefix={<WarningOutlined />} valueStyle={{ color: (summary?.abnormalOrders ?? 0) > 0 ? '#cf1322' : undefined }} /></Card>
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
