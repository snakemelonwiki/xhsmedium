'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Select, Space, Spin, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listSalesLeads } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import { LeadStatus, LeadAddStatus, LeadProcessStatus } from '@/shared/constants/lead-status-enums';
import type { SalesLead } from '@/shared/types/leads';

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '新分配', value: LeadStatus.ASSIGNED },
  { label: '待添加', value: 'pending_add' },
  { label: '未通过', value: LeadAddStatus.NOT_PASSED },
  { label: '已通过', value: LeadAddStatus.ADDED },
  { label: '跟进中', value: LeadStatus.IN_FOLLOWUP },
  { label: '无效', value: LeadStatus.INVALID },
];

const addStatusOptions = [
  { label: '全部添加状态', value: '' },
  { label: '未添加', value: LeadAddStatus.NOT_ADDED },
  { label: '已申请添加', value: LeadAddStatus.APPLIED },
  { label: '待通过', value: 'waiting_pass' },
  { label: '客户未通过', value: LeadAddStatus.NOT_PASSED },
  { label: '运营已提醒', value: LeadAddStatus.OPERATION_REMINDED },
  { label: '已添加通过', value: LeadAddStatus.ADDED },
];

export default function SalesLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [status, setStatus] = useState('');
  const [addStatus, setAddStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadLeads(nextPage = page, nextPageSize = pageSize, nextStatus = status, nextAddStatus = addStatus) {
    setLoading(true);
    setError('');
    try {
      const result = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        ...toStatusQuery(nextStatus),
        addStatus: nextAddStatus || toStatusQuery(nextStatus).addStatus || undefined,
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
    loadLeads(1, pageSize, status, addStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, addStatus]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的客资</Typography.Title>
          <Typography.Paragraph type="secondary">查看分配给当前销售的客资，并进入详情继续跟进。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Select value={status} options={statusOptions} onChange={setStatus} style={{ width: 160 }} />
          <Select value={addStatus} options={addStatusOptions} onChange={setAddStatus} style={{ width: 180 }} />
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
            onChange={(nextPage, nextPageSize) => loadLeads(nextPage, nextPageSize, status, addStatus)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>
    </Space>
  );
}

function toStatusQuery(value: string) {
  if (value === 'pending_add') return { addStatus: LeadAddStatus.NOT_ADDED };
  if (value === LeadAddStatus.NOT_PASSED) return { addStatus: LeadAddStatus.NOT_PASSED };
  if (value === LeadAddStatus.ADDED) return { addStatus: LeadAddStatus.ADDED };
  if (value === LeadStatus.INVALID) return { status: LeadStatus.INVALID, processStatus: LeadProcessStatus.INVALID };
  return { status: value || undefined };
}
