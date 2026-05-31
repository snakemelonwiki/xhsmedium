'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Select, Space, Spin, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listSalesLeads } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import type { SalesLead } from '@/shared/types/leads';

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '新分配', value: 'assigned' },
  { label: '跟进中', value: 'in_followup' },
  { label: '协同中', value: 'in_collaboration' },
  { label: '运营已处理', value: 'operation_handled' },
  { label: '已添加', value: 'added_success' },
  { label: '无效', value: 'invalid' },
];

export default function SalesLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadLeads(nextPage = page, nextPageSize = pageSize, nextStatus = status) {
    setLoading(true);
    setError('');
    try {
      const result = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        status: nextStatus || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '客资列表加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeads(1, pageSize, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的客资</Typography.Title>
          <Typography.Paragraph type="secondary">查看分配给当前销售的客资，并进入详情继续跟进。</Typography.Paragraph>
        </div>
        <Space>
          <Select value={status} options={statusOptions} onChange={setStatus} style={{ width: 160 }} />
          <Button icon={<ReloadOutlined />} onClick={() => loadLeads()} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {items.length ? (
            items.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onOpen={(item) => router.push(`/sales/leads/${item.id}`)}
                onCollaborate={(item) => router.push(`/sales/collaboration?leadId=${item.id}`)}
              />
            ))
          ) : (
            <Empty description="暂无客资" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => loadLeads(nextPage, nextPageSize, status)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>
    </Space>
  );
}
