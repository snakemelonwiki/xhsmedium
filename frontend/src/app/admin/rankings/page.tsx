'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, message, Pagination, Radio, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { createExport } from '@/shared/api/exports';

import { buildRankingExportFilter } from './exportFilter';

type RankingRow = {
  employeeId: string;
  name: string;
  accountCount?: number;
  postCount?: number;
  xhsPostCount?: number;
  douyinPostCount?: number;
  todayPosts?: number;
  todayLeads?: number;
  todayTraffic?: number;
  todayDeals?: number;
  leadCount?: number;
};

type RankingType = 'posts' | 'leads';
type Period = 'today' | '7d' | '30d';
type Platform = '' | 'xhs' | 'douyin';

/**
 * 主管运营排行榜：支持 type / platform / period 三档筛选，平铺所有员工聚合数据。
 * 后端接口在 1.2 P1-2 之后已支持这三个参数；旧版仅按单日聚合，主管端看到的几乎都是 0。
 */
export default function AdminRankingsPage() {
  const [items, setItems] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RankingType>('posts');
  const [period, setPeriod] = useState<Period>('today');
  const [platform, setPlatform] = useState<Platform>('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 20;

  async function load(nextPage = page, nextType = type, nextPeriod = period, nextPlatform = platform) {
    setLoading(true);
    setError(undefined);
    try {
      const query: Record<string, string | number> = {
        type: nextType,
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
        period: nextPeriod,
      };
      if (nextPlatform) query.platform = nextPlatform;
      const payload = await apiClient.get<any>('/rankings', { query });
      const data = payload?.items ?? payload ?? [];
      const totalCount = payload?.total ?? data.length;
      setItems(Array.isArray(data) ? data : []);
      setTotal(totalCount);
      setPage(nextPage);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '排行榜加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<RankingRow> = [
    { title: '排名', width: 80, render: (_, __, index) => (page - 1) * pageSize + index + 1 },
    { title: '员工', dataIndex: 'name', render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: '账号数', dataIndex: 'accountCount', width: 90 },
    { title: type === 'posts' ? '累计作品' : '累计客资', dataIndex: type === 'posts' ? 'postCount' : 'leadCount', width: 110 },
    { title: '小红书作品', dataIndex: 'xhsPostCount', width: 110 },
    { title: '抖音作品', dataIndex: 'douyinPostCount', width: 100 },
    { title: '区间作品', dataIndex: 'todayPosts', width: 100 },
    { title: '区间客资', dataIndex: 'todayLeads', width: 100 },
    { title: '区间流量', dataIndex: 'todayTraffic', width: 100 },
    { title: '区间成交', dataIndex: 'todayDeals', width: 100 },
  ];

  async function handleExport() {
    setExporting(true);
    try {
      await createExport({ exportType: 'rankings', filter: buildRankingExportFilter({ type, period, platform }) });
      message.success('已创建排行榜导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '排行榜导出创建失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>运营排行榜</Typography.Title>
        <Typography.Paragraph type="secondary">
          按员工聚合的作品、客资、流量和成交榜单，支持按平台 / 周期筛选。
        </Typography.Paragraph>
      </div>
      <Card>
        <Space size={16} wrap style={{ marginBottom: 16 }}>
          <Radio.Group value={type} onChange={(e) => { setType(e.target.value); void load(1, e.target.value, period, platform); }}>
            <Radio.Button value="posts">作品榜</Radio.Button>
            <Radio.Button value="leads">客资榜</Radio.Button>
          </Radio.Group>
          <Radio.Group value={period} onChange={(e) => { setPeriod(e.target.value); void load(1, type, e.target.value, platform); }}>
            <Radio.Button value="today">今日</Radio.Button>
            <Radio.Button value="7d">近 7 天</Radio.Button>
            <Radio.Button value="30d">近 30 天</Radio.Button>
          </Radio.Group>
          <Radio.Group value={platform} onChange={(e) => { setPlatform(e.target.value); void load(1, type, period, e.target.value); }}>
            <Radio.Button value="">全部平台</Radio.Button>
            <Radio.Button value="xhs">小红书</Radio.Button>
            <Radio.Button value="douyin">抖音</Radio.Button>
          </Radio.Group>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            当前筛选导出
          </Button>
        </Space>
        {error ? <Alert type="warning" showIcon message="排行榜暂不可用" description={error} style={{ marginBottom: 16 }} /> : null}
        <Table
          rowKey="employeeId"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无榜单数据" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(nextPage) => load(nextPage)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>
    </Space>
  );
}
