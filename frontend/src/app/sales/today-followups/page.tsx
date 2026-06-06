'use client';

import { CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Pagination, Space, Spin, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listTodayFollowupsForSales } from '@/shared/api/leads';
import { LeadCard } from '@/shared/components/leads';
import type { SalesLead } from '@/shared/types/leads';

export default function SalesTodayFollowupsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await listTodayFollowupsForSales({ page, pageSize });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '当日待跟进加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>
            <CalendarOutlined /> 当日待跟进
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            仅显示今天且未关闭的客资，按下次跟进时间升序。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {items.length ? (
            items.map((lead) => (
              <LeadCard
                key={String(lead.id)}
                lead={lead}
                onOpen={(item) => router.push(`/sales/leads/${item.id}`)}
              />
            ))
          ) : (
            <Empty description="今日无待跟进客资" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
              load();
            }}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>
    </Space>
  );
}
