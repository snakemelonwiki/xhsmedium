'use client';

import {
  BellOutlined,
  ExportOutlined,
  FormOutlined,
  ProjectOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Card, Segmented, Space, Tag, Typography } from 'antd';
import Link from 'next/link';

const entries = [
  {
    title: '作品录入',
    href: '/operation/posts/new',
    description: '补充作品链接、平台账号和封面截图',
    icon: <FormOutlined />,
  },
  {
    title: '客资录入',
    href: '/operation/leads/new',
    description: '录入客户线索并确认销售分配',
    icon: <UsergroupAddOutlined />,
  },
  {
    title: '协同处理',
    href: '/operation/collaboration',
    description: '处理销售发起的来源、内容和跟进协同',
    icon: <ProjectOutlined />,
  },
  {
    title: '主管建议/消息',
    href: '/operation/messages',
    description: '查看主管建议、协同通知和系统提醒',
    icon: <BellOutlined />,
  },
  {
    title: '导出中心',
    href: '/operation/exports',
    description: '导出自己范围内的作品、客资和排行榜数据',
    icon: <ExportOutlined />,
  },
];

export default function OperationHomePage() {
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-heading">
        <Space direction="vertical" size={8}>
          <Space wrap>
            <Typography.Title level={2} style={{ margin: 0 }}>运营总览</Typography.Title>
            <Tag color="blue">当前角色：运营</Tag>
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
        {entries.map((entry) => (
          <Link key={entry.href} href={entry.href}>
            <Card hoverable>
              <Space direction="vertical" size={8}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {entry.icon} {entry.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                  {entry.description}
                </Typography.Paragraph>
              </Space>
            </Card>
          </Link>
        ))}
      </div>
    </Space>
  );
}
