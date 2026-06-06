'use client';

import { DownloadOutlined, StarOutlined, TrophyOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  List,
  message,
  Pagination,
  Row,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { apiClient } from '@/shared/api/apiClient';
import { QuickRangePicker, RANGE_PRESETS_FULL } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import type { ContentPost } from '@/shared/types/content';

type RankingType = 'posts' | 'leads' | 'traffic';
/**
 * v1.3 / OP-7：保留 Period enum 作为后端兜底入参；前端 QuickRangePicker
 * 选中的精确区间会同时以 from / to 透传给后端，service 端走 range 优先。
 * 命中预设 → 对应 Period；用户手动改 RangePicker(命中不到)→ from/to 直接落库。
 */
type Period = 'today' | 'week' | 'month' | 'total' | '7d' | '14d' | '30d' | '90d' | '1y' | '3y';

/**
 * 把 QuickRangePicker 输出的 {start,end} 反推为后端 enum。
 * 命中预设 → 对应 Period；命中不到（用户手动改了 RangePicker）→ 返回 null，
 * 调用方应走 from / to 透传，service 端 range 优先。
 */
function derivePeriod(range: DateRangeValue): Period | null {
  if (!range) return 'today';
  const days = Math.max(0, range.end.diff(range.start, 'day'));
  if (days <= 1) return 'today';
  if (days <= 7) return '7d';
  if (days <= 14) return '14d';
  if (days <= 30) return '30d';
  if (days <= 90) return '90d';
  if (days <= 366) return '1y';
  if (days <= 365 * 3 + 1) return '3y';
  // 命中不到任何预设：返回 null 让调用方走 from/to 透传
  return null;
}

/**
 * v1.3 / OP-7：把 range 序列化为后端接受的 query。
 * - 命中预设：只发 period；
 * - 未命中（手动选了 RangePicker 任意区间）：同时发 from / to，service 端 range 优先。
 * 返回值类型为 Record<string, string | number> 便于直接传给 apiClient。
 */
function buildRangeQuery(range: DateRangeValue): { period: Period | null; from?: string; to?: string } {
  const period = derivePeriod(range);
  if (period) return { period };
  if (!range) return { period: 'today' };
  return {
    period: null,
    from: range.start.format('YYYY-MM-DD'),
    to: range.end.format('YYYY-MM-DD'),
  };
}

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

const TYPE_OPTIONS = [
  { label: '作品数榜', value: 'posts' },
  { label: '客资榜', value: 'leads' },
  { label: '流量榜', value: 'traffic' },
];

/**
 * 三卡顶部展示：作品数 / 客资数 / 流量数各取前三名
 */
const TOP_CARDS: Array<{
  key: RankingType;
  title: string;
  description: string;
  color: string;
  bg: string;
  /** 排序取值函数：从 RankingRow 中取出该维度对应的数值 */
  getValue: (row: RankingRow) => number;
  /** 列表文案后缀 */
  suffix: string;
}> = [
  {
    key: 'posts',
    title: '作品数榜 · Top 3',
    description: '本期作品数前三名',
    color: '#1677ff',
    bg: '#e6f4ff',
    getValue: (row) => numberValue(row.postCount),
    suffix: '件',
  },
  {
    key: 'leads',
    title: '客资榜 · Top 3',
    description: '本期客资数前三名',
    color: '#52c41a',
    bg: '#f6ffed',
    getValue: (row) => numberValue(row.leadCount),
    suffix: '条',
  },
  {
    key: 'traffic',
    title: '流量榜 · Top 3',
    description: '本期流量（点赞+评论+收藏）前三名',
    color: '#fa8c16',
    bg: '#fff7e6',
    getValue: (row) => numberValue(row.traffic ?? row.likes),
    suffix: '',
  },
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
  const [range, setRange] = useState<DateRangeValue>(null);
  // 当前选区对应的后端入参：{ period?, from?, to? }，未命中预设时 period 为 null
  const rangeQuery = useMemo(() => buildRangeQuery(range), [range]);
  // 顶部摘要卡仍需要后端 Period enum 兜底（来自 first preset match 或 'today'）
  const period: Period = rangeQuery.period ?? 'today';
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [top3ByType, setTop3ByType] = useState<Record<RankingType, RankingRow[]>>({
    posts: [],
    leads: [],
    traffic: [],
  });
  const [topLoading, setTopLoading] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (nextPage = page, nextType = type, nextRangeQuery = rangeQuery) => {
    setLoading(true);
    setError(undefined);
    try {
      const limit = pageSize;
      const offset = (nextPage - 1) * limit;
      const query: Record<string, string | number> = {
        type: nextType,
        limit,
        offset,
      };
      if (nextRangeQuery.period) query.period = nextRangeQuery.period;
      else {
        if (nextRangeQuery.from) query.from = nextRangeQuery.from;
        if (nextRangeQuery.to) query.to = nextRangeQuery.to;
      }
      const payload = await apiClient.get<{ items?: RankingRow[]; total?: number }>('/rankings/operations', {
        query,
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
  }, [page, type, rangeQuery]);

  /**
   * v1.3 OP-7：加载三榜 Top 3 用于顶部三卡展示。
   * 并行拉取三种 type 的 limit=3 数据，period 与下方主榜保持一致。
   */
  const loadTop3 = useCallback(async (nextRangeQuery = rangeQuery) => {
    setTopLoading(true);
    try {
      const results = await Promise.all(
        TYPE_OPTIONS.map(async (opt) => {
          try {
            const query: Record<string, string | number> = {
              type: opt.value,
              limit: 3,
              offset: 0,
            };
            if (nextRangeQuery.period) query.period = nextRangeQuery.period;
            else {
              if (nextRangeQuery.from) query.from = nextRangeQuery.from;
              if (nextRangeQuery.to) query.to = nextRangeQuery.to;
            }
            const payload = await apiClient.get<{ items?: RankingRow[] }>('/rankings/operations', {
              query,
            });
            return { key: opt.value, rows: payload?.items ?? [] };
          } catch {
            return { key: opt.value, rows: [] };
          }
        }),
      );
      setTop3ByType((prev) => {
        const next: Record<RankingType, RankingRow[]> = { ...prev };
        for (const r of results) {
          const key = r.key as RankingType;
          next[key] = Array.isArray(r.rows) ? (r.rows as RankingRow[]) : [];
        }
        return next;
      });
    } finally {
      setTopLoading(false);
    }
  }, [rangeQuery]);

  useEffect(() => {
    void load(1, type, rangeQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTop3(rangeQuery);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function changeType(nextType: RankingType) {
    setType(nextType);
    void load(1, nextType, rangeQuery);
  }

  function changeRange(next: DateRangeValue) {
    setRange(next);
    const nextRangeQuery = buildRangeQuery(next);
    void load(1, type, nextRangeQuery);
    void loadTop3(nextRangeQuery);
  }

  async function handleExport() {
    setExporting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const result = await createExport({ exportType: 'rankings', filter: { type, period } });

      if (!result?.id) {
        hide();
        message.warning('导出任务已创建，请在导出中心查看进度');
        return;
      }

      // 轮询导出状态，最多等待30秒
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);
        if (exportTask.status === 'completed' || exportTask.status === 'success') {
          hide();
          window.open(downloadExportUrl(result.id), '_blank');
          message.success('导出成功，文件开始下载');
          return;
        } else if (exportTask.status === 'failed') {
          hide();
          message.error('导出失败，请重试');
          return;
        }
        attempts++;
      }
      hide();
      message.warning('导出超时，请到导出中心查看');
    } catch (err) {
      hide();
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
      if (type === 'traffic') return item.traffic ?? item.likes ?? 0;
      return item.postCount;
    };
    return items.map((item, index) => {
      const currentValue = getValue(item);
      let gap = 0;
      if (index > 0) {
        const prevValue = getValue(items[index - 1]);
        // 与上一名差距用正数展示（差距方向已由列名"与上一名差距"隐含）。
        // 即便排序异常或同分，也保证不会出现负数或负号叠加。
        gap = Math.max(0, prevValue - currentValue);
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
            return <Tag color="orange">{gap}</Tag>;
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
            return <Tag color="orange">{gap}</Tag>;
          },
        },
      ];
    }

    // traffic
    return [
      ...baseColumns,
      {
        title: '流量（赞+评+藏）',
        dataIndex: 'traffic',
        sorter: (a, b) => (a.traffic ?? a.likes ?? 0) - (b.traffic ?? b.likes ?? 0),
        render: (val?: number, record?: RankingRow) => (
          <Typography.Text strong>{val ?? record?.likes ?? 0}</Typography.Text>
        ),
      },
      {
        title: '与上一名差距',
        dataIndex: 'gap',
        render: (gap: number) => {
          if (gap === 0) return '-';
          return <Tag color="orange">{gap}</Tag>;
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
          <QuickRangePicker
            value={range}
            onChange={changeRange}
            variant="select"
            presets={RANGE_PRESETS_FULL}
            selectWidth={140}
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

      {/* v1.3 OP-7：顶部三卡 - 作品数 / 客资数 / 流量数 Top 3 */}
      <Row gutter={16}>
        {TOP_CARDS.map((card) => {
          const rows = top3ByType[card.key] ?? [];
          return (
            <Col key={card.key} xs={24} md={8}>
              <Card
                size="small"
                loading={topLoading}
                title={
                  <Space>
                    <TrophyOutlined style={{ color: card.color }} />
                    <Typography.Text strong>{card.title}</Typography.Text>
                  </Space>
                }
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={() => changeType(card.key)}
                  >
                    查看完整榜
                  </Button>
                }
                style={{ background: card.bg, borderColor: card.color }}
              >
                {rows.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
                ) : (
                  <List
                    size="small"
                    dataSource={rows}
                    renderItem={(row, idx) => (
                      <List.Item style={{ padding: '8px 0' }}>
                        <Space>
                          <Avatar
                            size="small"
                            style={{
                              backgroundColor: idx === 0 ? '#fa8c16' : idx === 1 ? '#1677ff' : '#52c41a',
                            }}
                          >
                            {idx + 1}
                          </Avatar>
                          <Space direction="vertical" size={0}>
                            <Typography.Text strong>{row.name || row.employeeId || '—'}</Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {card.description}
                            </Typography.Text>
                          </Space>
                        </Space>
                        <Typography.Text strong style={{ color: card.color, fontSize: 18 }}>
                          {card.getValue(row)}{card.suffix}
                        </Typography.Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {error ? (
        <Alert type="warning" showIcon message="排行榜暂不可用" description={error} />
      ) : null}
      <Card>
        <div className="toolbar-row" style={{ marginBottom: 16 }}>
          <Segmented
            options={TYPE_OPTIONS}
            value={type}
            onChange={(val) => changeType(val as RankingType)}
          />
          <Space>
            <Button
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={handleExport}
            >
              导出
            </Button>
          </Space>
        </div>
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
