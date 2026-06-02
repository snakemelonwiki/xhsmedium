'use client';

import { CalendarOutlined, ClockCircleOutlined, LinkOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

import { StatusTag } from '@/shared/components/status';
import type { SalesLead } from '@/shared/types/leads';
import { formatDateTime } from '@/shared/utils/date-format';

type LeadCardProps = {
  lead: SalesLead;
  actions?: ReactNode;
  onOpen?: (lead: SalesLead) => void;
  onCollaborate?: (lead: SalesLead) => void;
};

function firstText(...values: Array<string | number | null | undefined>) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) ?? '-';
}

/**
 * Shared customer lead card for sales, operation, and admin views.
 */
export function LeadCard({ lead, actions, onOpen, onCollaborate }: LeadCardProps) {
  return (
    <Card className="lead-card">
      <Space direction="vertical" size={12} className="page-stack">
        <div className="lead-card-header">
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{firstText(lead.customerName, lead.nickname, `客资 ${lead.id}`)}</Typography.Text>
            <Typography.Text type="secondary">{firstText(lead.contact, lead.phone, lead.wechat, '暂无联系方式')}</Typography.Text>
          </Space>
          <Space wrap>
            <StatusTag kind="leadStatus" code={lead.status} />
            <StatusTag kind="addStatus" code={lead.addStatus} />
            <StatusTag kind="processStatus" code={lead.processStatus} />
            <StatusTag kind="collaborationStatus" code={lead.collaborationStatus} />
          </Space>
        </div>

        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label={<><LinkOutlined /> 来源</>}>
            {firstText(lead.source?.accountName, lead.source?.postTitle, lead.source?.platform)}
          </Descriptions.Item>
          <Descriptions.Item label={<><UserOutlined /> 运营</>}>{firstText(lead.operator?.name)}</Descriptions.Item>
          <Descriptions.Item label={<><CalendarOutlined /> 分配时间</>}>{formatDateTime(lead.assignedAt)}</Descriptions.Item>
          <Descriptions.Item label={<><ClockCircleOutlined /> 最近跟进</>}>
            {lead.latestFollowAt
              ? formatDateTime(lead.latestFollowAt)
              : lead.latestFollowNote
                ? '有跟进记录'
                : '-'}
          </Descriptions.Item>
        </Descriptions>

        {lead.latestFollowNote ? <Typography.Paragraph type="secondary">{lead.latestFollowNote}</Typography.Paragraph> : null}

        <Space wrap>
          {onOpen ? <Button type="primary" onClick={() => onOpen(lead)}>查看详情</Button> : null}
          {onCollaborate ? <Button onClick={() => onCollaborate(lead)}>申请协同</Button> : null}
          {actions}
        </Space>
      </Space>
    </Card>
  );
}
