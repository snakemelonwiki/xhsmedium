'use client';

import { Card, Empty, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { listSalesLeads } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import type { SalesLead } from '@/shared/types/leads';

export default function SalesFollowupsPage() {
  const [items, setItems] = useState<SalesLead[]>([]);

  useEffect(() => {
    listSalesLeads({ pageSize: 20, status: 'assigned' }).then((result) => setItems(result.items)).catch(() => setItems([]));
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>待跟进</Typography.Title>
        <Typography.Paragraph type="secondary">新分配、客户未通过和运营已处理后需要继续跟进的客资。</Typography.Paragraph>
      </div>
      <Card>{items.length ? items.map((lead) => <LeadCard key={lead.id} lead={lead} />) : <Empty description="暂无待跟进客资" />}</Card>
    </Space>
  );
}
