'use client';

import { Card, Space, Typography } from 'antd';
import Link from 'next/link';

const entries = [
  { title: '作品录入', href: '/operation/posts/new', description: '录入作品链接、平台、账号和封面截图' },
  { title: '客资录入', href: '/operation/leads/new', description: '录入客户线索并分配给销售' },
  { title: '客资看板', href: '/operation/leads', description: '查看自己录入客资和销售状态回写' },
  { title: '协同处理', href: '/operation/collaboration', description: '处理销售发起的运营协同任务' },
];

export default function OperationHomePage() {
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>运营首页</Typography.Title>
        <Typography.Paragraph type="secondary">围绕作品、客资、销售分配和协同处理的工作入口。</Typography.Paragraph>
      </div>
      <div className="metric-grid">
        {entries.map((entry) => (
          <Link key={entry.href} href={entry.href}>
            <Card hoverable>
              <Typography.Title level={4}>{entry.title}</Typography.Title>
              <Typography.Paragraph type="secondary">{entry.description}</Typography.Paragraph>
            </Card>
          </Link>
        ))}
      </div>
    </Space>
  );
}
