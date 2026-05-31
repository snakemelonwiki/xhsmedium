'use client';

import { Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

type PlaceholderPageProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * 业务页面未接入前的统一占位壳。
 */
export function PlaceholderPage({ title, description, children }: PlaceholderPageProps) {
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="page-heading">
        <Typography.Title level={2}>{title}</Typography.Title>
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      </div>
      <Card className="workspace-card">{children ?? '业务模块接入中'}</Card>
    </Space>
  );
}
