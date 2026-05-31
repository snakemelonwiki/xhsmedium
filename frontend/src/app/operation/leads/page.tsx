'use client';

import { Button, Card, Empty, Pagination, Space, Typography } from 'antd';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listSalesLeads } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import type { SalesLead } from '@/shared/types/leads';

export default function OperationLeadsPage() {
  const [items, setItems] = useState<SalesLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  async function load(nextPage = page) {
    const result = await listSalesLeads({ scope: 'self', page: nextPage, pageSize });
    setItems(result.items);
    setTotal(result.total);
    setPage(result.page);
  }

  useEffect(() => {
    load(1).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>运营客资看板</Typography.Title>
          <Typography.Paragraph type="secondary">回看自己录入客资的分配、添加、跟进和协同状态。</Typography.Paragraph>
        </div>
        <Link href="/operation/leads/new"><Button type="primary">录入客资</Button></Link>
      </div>
      <Card>
        {items.length ? items.map((lead) => <LeadCard key={lead.id} lead={lead} />) : <Empty description="暂无客资" />}
        <Pagination current={page} pageSize={pageSize} total={total} onChange={load} style={{ marginTop: 16, textAlign: 'right' }} />
      </Card>
    </Space>
  );
}
