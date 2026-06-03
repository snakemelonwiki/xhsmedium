'use client';

import { DownloadOutlined, StarOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  message,
  Pagination,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createExport } from '@/shared/api/exports';
import { apiClient } from '@/shared/api/apiClient';
import type { ContentPost } from '@/shared/types/content';

type RankingType = 'posts' | 'leads' | 'traffic';
type Period = 'today' | 'week' | 'month' | 'total';

interface RankingRow {
  id: string;
  employeeId?: string;
  name: string;
  postCount: number;
  leadCount: number;
  sourcePostCount?: number;
  validRate?: number;
  likes?: number;
  traffic?: number;
  avatar?: string;
  employeeNo?: string;
  todayPosts?: number;
  todayLeads?: number;
  todayTraffic?: number;
}

const PERIOD_OPTIONS = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '累计', value: 'total' },
];

const TYPE_OPTIONS = [
  { label: '作品数榜', value: 'posts' },
  { label: '客资榜', value: 'leads' },
  { label: '流量榜', value: 'traffic' },
];

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function OperationRankingsPage() {
  const router = useRouter();
  const [items, setItems] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RankingType>('posts');
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const pageSize = 20;

  const load = useCallback(async (nextPage = page, nextType = type, nextPeriod = period) => {
    setLoading(true);
    setError(undefined);
    try {
      const limit = pageSize;
      const offset = (nextPage - 1) * limit;
      const payload = await apiClient.get<{ items?: RankingRow[]; total?: number }>('/rankings/operations', {
        query: { type: nextType, period: nextPeriod, limit, offset },
      });
      const rows = payload?.items ?? [];
      const totalCount = payload?.total ?? rows.length;
      setItems(Array.isArray(rows) ? rows : []);
      setTotal(totalCount);
      setPage(nextPage);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '排行榜加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, type, period]);

  useEffect(() => {
    void load(1, type, period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(nextType: RankingType) {
    setType(nextType);
    void load(1, nextType, period);
  }

  function changePeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    void load(1, type, nextPeriod);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await createExport({ exportType: 'rankings', filter: { type, period } });
      message.success('已创建排行榜导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '排行榜导出创建失败');
    } finally {
      setExporting(false);
    }
  }

  function goToStudy() {
    router.push('/operation/rankings/study');
  }

  // 计算与上一名的差距
  const itemsWithGap = useMemo(() => {
    if (items.length === 0) return [];
    const getValue = (item: RankingRow) => {
      if (type === 'leads') return item.leadCount;
      if (type === 'traffic') return item.likes ?? item.traffic ?? 0;
      return item.postCount;
    };
    return items.map((item, index) => {
      const currentValue = getValue(item);
      let gap = 0;
      if (index > 0) {
        const prevValue = getValue(items[index - 1]);
        gap = prevValue - currentValue;
      }
      return { ...item, gap };
    });
  }, [items, type]);

  // 根据类型生成列配置
  const columns: ColumnsType<RankingRow> = useMemo(() => {
    const baseColumns: ColumnsType<RankingRow> = [
      {
        title: '排名',
        width: 80,
        render: (_, __, index) => (page - 1) * pageSize + index + 1,
      },
      {
        title: '运营员工',
        dataIndex: 'name',
        width: 150,
        render: (name: string, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{name}</Typography.Text>
            {record.employeeNo && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                工号: {record.employeeNo}
              </Typography.Text>
            )}
          </Space>
        ),
      },
    ];

    if (type === 'posts') {
      return [
        ...baseColumns,
        {
          title: '本期作品数',
          dataIndex: 'postCount',
          sorter: (a, b) => a.postCount - b.postCount,
          render: (val: number) => <Typography.Text strong>{val}</Typography.Text>,
        },
        {
          title: '与上一名差距',
          dataIndex: 'gap',
          render: (gap: number) => {
            if (gap === 0) return '-';
            return <Tag color="orange">-{gap}</Tag>;
          },
        },
      ];
    }

    if (type === 'leads') {
      return [
        ...baseColumns,
        {
          title: '客资数',
          dataIndex: 'leadCount',
          sorter: (a, b) => a.leadCount - b.leadCount,
          render: (val: number) => <Typography.Text strong>{val}</Typography.Text>,
        },
        {
          title: '来源作品数',
          dataIndex: 'sourcePostCount',
          render: (val?: number) => val ?? '-',
        },
        {
          title: '有效率',
          dataIndex: 'validRate',
          render: (val?: number) => {
            if (val === undefined || val === null) return '-';
            return `${(val * 100).toFixed(1)}%`;
          },
        },
        {
          title: '与上一名差距',
          dataIndex: 'gap',
          render: (gap: number) => {
            if (gap === 0) return '-';
            return <Tag color="orange">-{gap}</Tag>;
          },
        },
      ];
    }

    // traffic
    return [
      ...baseColumns,
      {
        title: '点赞数',
        dataIndex: 'likes',
        sorter: (a, b) => (a.likes ?? 0) - (b.likes ?? 0),
        render: (val?: number) => <Typography.Text strong>{val ?? 0}</Typography.Text>,
      },
      {
        title: '流量',
        dataIndex: 'traffic',
        render: (val?: number) => val ?? '-',
      },
      {
        title: '与上一名差距',
        dataIndex: 'gap',
        render: (gap: number) => {
          if (gap === 0) return '-';
          return <Tag color="orange">-{gap}</Tag>;
        },
      },
    ];
  }, [type, page, pageSize]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>排行榜</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看员工作品数、客资和流量榜单，支持按周期筛选。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            options={TYPE_OPTIONS}
            value={type}
            onChange={(val) => changeType(val as RankingType)}
          />
          <Segmented
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(val) => changePeriod(val as Period)}
          />
          <Button
            type="link"
            icon={<StarOutlined />}
            onClick={goToStudy}
          >
            学习榜单
          </Button>
        </Space>
      </div>
      {error ? (
        <Alert type="warning" showIcon message="排行榜暂不可用" description={error} />
      ) : null}
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
          >
            导出
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={itemsWithGap}
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
