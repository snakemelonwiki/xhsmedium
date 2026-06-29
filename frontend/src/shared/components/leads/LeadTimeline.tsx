'use client';

import { ClockCircleOutlined, MessageOutlined, ProjectOutlined } from '@ant-design/icons';
import { Empty, Timeline, Typography } from 'antd';

import { StatusTag } from '@/shared/components/status';
import type { LeadTimelineItem } from '@/shared/types/leads';
import { formatDateTime } from '@/shared/utils/date-format';

type LeadTimelineProps = {
  items: LeadTimelineItem[];
};

/**
 * Unified follow-up and collaboration timeline.
 */
export function LeadTimeline({ items }: LeadTimelineProps) {
  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />;
  }

  return (
    <Timeline
      items={items.map((item) => ({
        color: item.kind === 'supervisor_suggestion' ? 'orange' : undefined,
        dot: item.kind === 'collaboration'
          ? <ProjectOutlined />
          : item.kind === 'supervisor_suggestion'
            ? <MessageOutlined />
            : <ClockCircleOutlined />,
        children: (
          <div>
            <Typography.Text strong>
              {item.kind === 'supervisor_suggestion' ? (
                <><span style={{ color: '#fa8c16' }}>[主管建议]</span>{item.title ? <> {item.title}</> : null}</>
              ) : item.title}
            </Typography.Text>
            {item.status ? (
              <span className="timeline-status">
                <StatusTag kind={item.kind === 'collaboration' ? 'collaborationStatus' : 'processStatus'} code={item.status} />
              </span>
            ) : null}
            {item.priority ? <Typography.Text type="secondary"> {priorityLabel(item.priority)}</Typography.Text> : null}
            <div className="timeline-meta">
              {item.actorName ? `${item.actorName} · ` : ''}
              {formatDateTime(item.occurredAt)}
            </div>
            {item.content ? <Typography.Paragraph className="timeline-content">{item.content}</Typography.Paragraph> : null}
          </div>
        ),
      }))}
    />
  );
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    normal: '普通',
    urgent: '紧急',
    critical: '特急',
    high: '紧急',
  };
  return labels[priority] ?? priority;
}
