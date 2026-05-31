import { Card, Statistic } from 'antd';
import type { CardProps, StatisticProps } from 'antd';
import React from 'react';
import type { ReactNode } from 'react';

export type PortHomeCardProps = {
  title: ReactNode;
  value: StatisticProps['value'];
  prefix?: StatisticProps['prefix'];
  suffix?: StatisticProps['suffix'];
  precision?: StatisticProps['precision'];
  loading?: boolean;
  extra?: ReactNode;
  cardProps?: Omit<CardProps, 'children' | 'loading' | 'extra'>;
};

/**
 * Presents a single port-home statistic in a compact CRM dashboard card.
 */
export function PortHomeCard({
  title,
  value,
  prefix,
  suffix,
  precision,
  loading,
  extra,
  cardProps,
}: PortHomeCardProps) {
  return (
    <Card size="small" {...cardProps} loading={loading} extra={extra}>
      <Statistic
        title={title}
        value={value}
        prefix={prefix}
        suffix={suffix}
        precision={precision}
      />
    </Card>
  );
}
