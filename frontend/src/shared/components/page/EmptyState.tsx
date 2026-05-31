import { Empty, Space } from 'antd';
import type { EmptyProps } from 'antd';
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type EmptyStateProps = {
  description?: ReactNode;
  action?: ReactNode;
  image?: EmptyProps['image'];
  className?: string;
  style?: CSSProperties;
};

/**
 * Displays the shared empty-data treatment with an optional next action.
 */
export function EmptyState({
  description = '暂无数据',
  action,
  image = Empty.PRESENTED_IMAGE_SIMPLE,
  className,
  style,
}: EmptyStateProps) {
  return (
    <Space
      className={className}
      align="center"
      direction="vertical"
      size={8}
      style={{ display: 'flex', padding: '32px 16px', ...style }}
    >
      <Empty image={image} description={description} />
      {action}
    </Space>
  );
}
