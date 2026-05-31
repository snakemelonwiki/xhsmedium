'use client';

import { ClockCircleOutlined, ProjectOutlined } from '@ant-design/icons';
import { Empty, Timeline, Typography } from 'antd';

import { StatusTag } from '@/shared/components/status';
import type { LeadTimelineItem } from '@/shared/types/leads';

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
        dot: item.kind === 'collaboration' ? <ProjectOutlined /> : <ClockCircleOutlined />,
        children: (
          <div>
            <Typography.Text strong>{item.title}</Typography.Text>
            {item.status ? (
              <span className="timeline-status">
                <StatusTag kind={item.kind === 'collaboration' ? 'collaborationStatus' : 'processStatus'} code={item.status} />
              </span>
            ) : null}
            <div className="timeline-meta">
              {item.actorName ? `${item.actorName} · ` : ''}
              {item.occurredAt}
            </div>
            {item.content ? <Typography.Paragraph className="timeline-content">{item.content}</Typography.Paragraph> : null}
          </div>
        ),
      }))}
    />
  );
}
