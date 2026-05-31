import { Space, Typography } from 'antd';
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type PageHeaderBarProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Displays a page title, optional context text, and page-level actions.
 */
export function PageHeaderBar({
  title,
  description,
  actions,
  className,
  style,
}: PageHeaderBarProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        ...style,
      }}
    >
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Text type="secondary">{description}</Typography.Text>
        ) : null}
      </Space>
      {actions ? <Space wrap>{actions}</Space> : null}
    </div>
  );
}
