import { Space } from 'antd';
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type FilterBarProps = {
  children?: ReactNode;
  extra?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Groups page filters and optional toolbar actions in a restrained workspace bar.
 */
export function FilterBar({ children, extra, className, style }: FilterBarProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: 16,
        border: '1px solid #e5e8ef',
        borderRadius: 8,
        background: '#ffffff',
        ...style,
      }}
    >
      <Space wrap>{children}</Space>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}
