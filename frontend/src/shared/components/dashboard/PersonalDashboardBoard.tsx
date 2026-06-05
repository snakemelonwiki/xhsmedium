'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  FireOutlined,
  FundProjectionScreenOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ReloadOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  EfficiencyAccount,
  PersonalMetric,
  PersonalOverviewResponse,
  PersonalPeriod,
  PersonalPlatform,
  PersonalRankingSort,
  PersonalRankingsResponse,
} from '@/shared/api/content';
import type { PlatformDistributionItem, PlatformTrend, PlatformTrendPoint } from '@/shared/types/content';
import { useMemo, useState } from 'react';

import { useEchartsChart, useEchartsRender } from './useEchartsChart';
import { usePersonalDashboardData } from './usePersonalDashboardData';
import { PlatformAnalysisPanel } from './PlatformAnalysisPanel';
import styles from './PersonalDashboardBoard.module.css';

// echarts 通过 layout.tsx 注入的 CDN script 暴露为 window.echarts，
// 它的加载晚于组件首次渲染，需要在 useEffect 内等 ready 后再 init，
// 避免 dev 模式 HMR 偶发丢失全局变量导致 ReferenceError。
// 参考 admin/analytics/page.tsx 的 EChart 容器实现；初始化 / dispose 已在 useEchartsChart 中集中。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const echarts: any;

const METRIC_OPTIONS: { label: string; value: PersonalMetric; description: string }[] = [
  { label: '总流量', value: 'totalTraffic', description: '所有作品 likes+comments+favorites 之和' },
  { label: '总获客', value: 'totalLeads', description: '所有作品关联的客资数' },
  { label: '获客效率', value: 'efficiency', description: '客资数 / 作品数' },
  { label: '获客贴效率', value: 'leadEfficiency', description: '客资数 / 获客贴数（is_lead_post=1）' },
];

const RANKING_SORT_OPTIONS: { label: string; value: PersonalRankingSort }[] = [
  { label: '按获客数', value: 'leadCount' },
  { label: '按作品数', value: 'postCount' },
  { label: '按流量', value: 'traffic' },
  { label: '按获客效率', value: 'efficiency' },
  { label: '按获客贴效率', value: 'leadEfficiency' },
];

const PLATFORM_OPTIONS: { label: string; value: PersonalPlatform }[] = [
  { label: '全部', value: 'all' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
];

const PERIOD_OPTIONS: { label: string; value: PersonalPeriod }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '累计', value: 'all' },
];

const OVERVIEW_CARDS: Array<{
  key: keyof PersonalOverviewResponse['overview'];
  title: string;
  hint: string;
  color: string;
  icon: React.ReactNode;
}> = [
  { key: 'totalTraffic', title: '总流量', hint: 'likes+comments+favorites', color: '#fa541c', icon: <FireOutlined /> },
  { key: 'totalLeads', title: '总获客', hint: '历史累计客资', color: '#52c41a', icon: <TrophyOutlined /> },
  { key: 'monthPostCount', title: '本月作品数', hint: '当前自然月', color: '#1890ff', icon: <RiseOutlined /> },
  { key: 'monthLeadCount', title: '本月客资数', hint: '当前自然月', color: '#722ed1', icon: <ThunderboltOutlined /> },
  { key: 'monthTraffic', title: '本月流量', hint: '当前自然月 likes+comments+favorites', color: '#eb2f96', icon: <LineChartOutlined /> },
  { key: 'monthLeadPostCount', title: '本月获客贴数', hint: 'is_lead_post = 1', color: '#13c2c2', icon: <TrophyOutlined /> },
];

export interface PersonalDashboardBoardProps {
  /** 不传时查当前运营（运营端），传值时查指定员工（主管端） */
  employeeId?: string;
  /** 是否显示「刷新」按钮 */
  showRefreshButton?: boolean;
}

export function PersonalDashboardBoard({ employeeId, showRefreshButton = true }: PersonalDashboardBoardProps) {
  const [metric, setMetric] = useState<PersonalMetric>('totalTraffic');
  const [platform, setPlatform] = useState<PersonalPlatform>('all');
  const [period, setPeriod] = useState<PersonalPeriod>('month');
  // OP-19 趋势周期：日/周/月（独立于上面 period）
  const [trendPeriod, setTrendPeriod] = useState<'day' | 'week' | 'month'>('day');
  // 三大效率榜排序字段：默认按获客数降序
  const [rankingSort, setRankingSort] = useState<PersonalRankingSort>('leadCount');

  const {
    overview,
    rankings,
    platformDist,
    platformTrend,
    loadingOverview,
    loadingRankings,
    loadingDualPlatform,
    error,
    refreshAll,
  } = usePersonalDashboardData({
    metric,
    platform,
    period,
    trendPeriod,
    rankingSort,
    employeeId,
  });

  // 旧的三个 useEffect + useCallback 加载逻辑已下沉到 usePersonalDashboardData，组件只保留 UI 状态。

  const rankingNode = useMemo(() => {
    if (!overview) return <Empty description="暂无名次数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    const { rank, total, gapToPrev, metricValue } = overview.ranking;
    if (rank === null || rank === undefined) {
      return <Empty description="暂无足够数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    const metricLabel = METRIC_OPTIONS.find((m) => m.value === overview.metrics)?.label ?? '指标';
    return (
      <div className={styles.rankCard}>
        <div className={styles.rankHead}>
          <Typography.Text type="secondary" className={styles.rankEyebrow}>我的名次</Typography.Text>
          <Tag color="blue">{metricLabel}</Tag>
        </div>
        <div className={styles.rankBody}>
          <span className={styles.rankValue}>{rank}</span>
          <span className={styles.rankTotal}>/ {total}</span>
        </div>
        <div className={styles.rankFooter}>
          <Typography.Text type="secondary">当前值：</Typography.Text>
          <Typography.Text strong>{metricValue.toFixed(2)}</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 12 }}>与上一名差距：</Typography.Text>
          <Typography.Text strong style={{ color: gapToPrev > 0 ? '#fa541c' : '#52c41a' }}>
            {gapToPrev > 0 ? `-${gapToPrev.toFixed(2)}` : '—'}
          </Typography.Text>
        </div>
      </div>
    );
  }, [overview]);

  const overviewCardsNode = useMemo(() => {
    if (!overview) return null;
    return (
      <Row gutter={[12, 12]}>
        {OVERVIEW_CARDS.map((card) => (
          <Col key={card.key} xs={12} md={8} lg={4}>
            <Card size="small" loading={loadingOverview} className={styles.overviewCard}>
              <Space size={4} align="center" className={styles.overviewCardHead}>
                <span style={{ color: card.color, fontSize: 16 }}>{card.icon}</span>
                <Typography.Text strong>{card.title}</Typography.Text>
                <Tooltip title={card.hint}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, cursor: 'help' }}>?</Typography.Text>
                </Tooltip>
              </Space>
              <Statistic
                value={overview.overview[card.key] ?? 0}
                valueStyle={{ color: card.color, fontSize: 22, fontWeight: 600 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }, [overview, loadingOverview]);

  const rankingTabItems = useMemo(() => {
    const makeColumns = (
      valueField: keyof EfficiencyAccount,
      valueRender: (v: number) => string,
      metricLabel: string,
    ): ColumnsType<EfficiencyAccount> => {
      const items = (rankings?.accounts[metricKey(valueField)] ?? []).slice(0, 20);
      const max = items.reduce((m, it) => Math.max(m, it[valueField] as number), 0) || 1;
      return [
        {
          title: '排名',
          dataIndex: 'accountId',
          width: 60,
          render: (_: string, __: EfficiencyAccount, index: number) => index + 1,
        },
        {
          title: '账号',
          dataIndex: 'accountName',
          render: (v: string, r: EfficiencyAccount) => (
            <Space size={4} align="center">
              <Typography.Text strong>{v || r.accountId}</Typography.Text>
              {r.platform ? <Tag>{r.platform}</Tag> : null}
            </Space>
          ),
        },
        {
          title: '作品数',
          dataIndex: 'postCount',
          align: 'right' as const,
          width: 80,
        },
        {
          title: '客资数',
          dataIndex: 'leadCount',
          align: 'right' as const,
          width: 80,
        },
        {
          title: metricLabel,
          dataIndex: valueField as string,
          align: 'right' as const,
          width: 140,
          render: (v: unknown) => {
            const num = Number(v) || 0;
            return (
              <Space size={6} style={{ width: '100%', justifyContent: 'flex-end' }} align="center">
                <Typography.Text strong>{valueRender(num)}</Typography.Text>
                <Progress
                  percent={max > 0 ? Math.round((num / max) * 100) : 0}
                  showInfo={false}
                  size="small"
                  strokeColor={valueField === 'traffic' ? '#fa541c' : valueField === 'leadEfficiency' ? '#722ed1' : '#52c41a'}
                  style={{ width: 60, marginBottom: 0 }}
                />
              </Space>
            );
          },
        },
        {
          title: '近 7 日流量趋势',
          dataIndex: 'trend',
          width: 120,
          render: (trend: number[]) => <Sparkline values={trend} />,
        },
      ];
    };
    return [
      {
        key: 'traffic',
        label: '流量榜',
        children: rankings ? (
          <EfficiencyTable
            items={rankings.accounts.traffic.slice(0, 20)}
            columns={makeColumns('traffic', (v) => v.toLocaleString(), '流量')}
            loading={loadingRankings}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ),
      },
      {
        key: 'efficiency',
        label: '获客效率榜',
        children: rankings ? (
          <EfficiencyTable
            items={rankings.accounts.efficiency.slice(0, 20)}
            columns={makeColumns('efficiency', (v) => v.toFixed(2), '效率 (客/作品)')}
            loading={loadingRankings}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ),
      },
      {
        key: 'leadEfficiency',
        label: '获客贴效率榜',
        children: rankings ? (
          <EfficiencyTable
            items={rankings.accounts.leadEfficiency.slice(0, 20)}
            columns={makeColumns('leadEfficiency', (v) => v.toFixed(2), '效率 (客/获客贴)')}
            loading={loadingRankings}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ),
      },
    ];
  }, [rankings, loadingRankings]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 顶部切换器 */}
      <Card size="small">
        <Space wrap size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size={8}>
            <Space size={4} align="center">
              <Typography.Text type="secondary">指标</Typography.Text>
              <Segmented
                value={metric}
                onChange={(v) => setMetric(v as PersonalMetric)}
                options={METRIC_OPTIONS.map((m) => ({ label: m.label, value: m.value }))}
              />
            </Space>
            <Space size={4} align="center">
              <Typography.Text type="secondary">平台</Typography.Text>
              <Segmented
                value={platform}
                onChange={(v) => setPlatform(v as PersonalPlatform)}
                options={PLATFORM_OPTIONS}
              />
            </Space>
            <Space size={4} align="center">
              <Typography.Text type="secondary">时间</Typography.Text>
              <Segmented
                value={period}
                onChange={(v) => setPeriod(v as PersonalPeriod)}
                options={PERIOD_OPTIONS}
              />
            </Space>
          </Space>
          {showRefreshButton ? (
            <Button icon={<ReloadOutlined />} loading={loadingOverview || loadingRankings} onClick={() => void refreshAll()}>
              刷新
            </Button>
          ) : null}
        </Space>
      </Card>

      {error ? <Alert type="warning" showIcon message="个人看板数据暂不可用" description={error} /> : null}

      {/* 5 张概览卡 + 名次卡 */}
      <Row gutter={12}>
        <Col xs={24} md={16}>
          {overviewCardsNode}
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" loading={loadingOverview} className={styles.rankWrapper}>
            {rankingNode}
          </Card>
        </Col>
      </Row>

      {/* v1.3 OP-18/19 双平台饼图 + 作品量柱状图 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <Card size="small" title={<><PieChartOutlined /> 双平台分布</>}>
            <Row gutter={8}>
              <Col span={8}>
                <PlatformPieChart items={platformDist} metric="postCount" loading={loadingDualPlatform} />
              </Col>
              <Col span={8}>
                <PlatformPieChart items={platformDist} metric="traffic" loading={loadingDualPlatform} />
              </Col>
              <Col span={8}>
                <PlatformPieChart items={platformDist} metric="leadCount" loading={loadingDualPlatform} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card
            size="small"
            title={
              <div className={styles.trendToolbar}>
                <Space size={4} align="center">
                  <FundProjectionScreenOutlined />
                  <Typography.Text strong>双平台作品量趋势</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {trendPeriod === 'day' ? '按日' : trendPeriod === 'week' ? '按周' : '按月'}
                  </Typography.Text>
                </Space>
                <Space size={4} align="center">
                  <span className={styles.trendLegend}>
                    <span className={styles.trendLegendDot} style={{ background: '#fa8c16' }} /> 小红书
                  </span>
                  <span className={styles.trendLegend}>
                    <span className={styles.trendLegendDot} style={{ background: '#1677ff' }} /> 抖音
                  </span>
                  <Segmented
                    size="small"
                    value={trendPeriod}
                    onChange={(v) => setTrendPeriod(v as 'day' | 'week' | 'month')}
                    options={[
                      { label: '日', value: 'day' },
                      { label: '周', value: 'week' },
                      { label: '月', value: 'month' },
                    ]}
                  />
                </Space>
              </div>
            }
          >
            <PlatformTrendBarChart trend={platformTrend} loading={loadingDualPlatform} />
          </Card>
        </Col>
      </Row>

      {/* v1.3 双平台数据分析面板（顶部 3 概览卡 + 3 榜单 Top 8） */}
      <PlatformAnalysisPanel
        rankings={rankings}
        platformDist={platformDist}
        loading={loadingRankings}
      />

      {/* 三大效率榜（OP-24 legacy 样式） */}
      <Card
        title={
          <Space size={8} align="center">
            <Typography.Text strong>三大效率榜</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              默认按获客数降序
            </Typography.Text>
          </Space>
        }
        extra={
          <Space size={4} align="center">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>排序</Typography.Text>
            <Segmented
              size="small"
              value={rankingSort}
              onChange={(v) => setRankingSort(v as PersonalRankingSort)}
              options={RANKING_SORT_OPTIONS}
            />
          </Space>
        }
      >
        <Tabs items={rankingTabItems} />
      </Card>
    </Space>
  );
}

function metricKey(valueField: keyof EfficiencyAccount): 'traffic' | 'efficiency' | 'leadEfficiency' {
  if (valueField === 'traffic') return 'traffic';
  if (valueField === 'leadEfficiency') return 'leadEfficiency';
  return 'efficiency';
}

function EfficiencyTable({
  items,
  columns,
  loading,
}: {
  items: EfficiencyAccount[];
  columns: ColumnsType<EfficiencyAccount>;
  loading: boolean;
}) {
  if (items.length === 0) {
    return <Empty description="暂无榜单数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <Table
      size="small"
      rowKey="accountId"
      loading={loading}
      columns={columns}
      dataSource={items}
      pagination={false}
      rowClassName={() => styles.efficiencyRow}
    />
  );
}

/**
 * 极简 sparkline：纯 SVG path，不依赖图表库。
 * 输入长度 0 时直接返回占位。
 */
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) {
    return <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 80;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`)).join(' ');
  const last = values[values.length - 1];
  const first = values[0];
  const trend = last > first ? <ArrowUpOutlined style={{ color: '#52c41a' }} /> : last < first ? <ArrowDownOutlined style={{ color: '#fa541c' }} /> : null;
  return (
    <Space size={4} align="center">
      <svg width={w} height={h} aria-label="近 7 日趋势" role="img">
        <path d={path} fill="none" stroke="#1677ff" strokeWidth={1.5} />
      </svg>
      {trend}
    </Space>
  );
}

// ============ v1.3 OP-18 双平台饼状图（echarts） ============

function PlatformPieChart({ items, metric, loading }: { items: PlatformDistributionItem[]; metric: 'postCount' | 'traffic' | 'leadCount'; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();

  useEchartsRender<PlatformDistributionItem[]>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data: items,
    isEmpty: (d) =>
      d
        .filter((it) => it.platform === '小红书' || it.platform === '抖音')
        .map((it) => it.platform === '小红书' || it.platform === '抖音' ? (it[metric] ?? 0) : 0)
        .filter((v) => v > 0).length === 0,
    emptyHTML: '<div class="' + styles.pieChartBoxEmpty + '">暂无数据</div>',
    buildOption: (d) => {
      const data = d
        .filter((it) => it.platform === '小红书' || it.platform === '抖音')
        .map((it) => ({ name: it.platform, value: it[metric] ?? 0 }))
        .filter((it) => it.value > 0);
      const title = metric === 'postCount' ? '作品占比' : metric === 'traffic' ? '流量占比' : '获客占比';
      return {
        title: { text: title, textStyle: { fontSize: 14, fontWeight: 'normal' }, left: 'center' },
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0 },
        color: ['#fa8c16', '#1677ff'],
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            data,
            label: { show: true, formatter: '{b}: {c}' },
          },
        ],
      };
    },
    deps: [items, metric, loading, echartsReady, containerRef, chartRef],
  });

  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} className={styles.pieChartBox} />
    </Skeleton>
  );
}

// ============ v1.3 OP-19 双平台作品量柱状图（echarts） ============

function PlatformTrendBarChart({ trend, loading }: { trend?: PlatformTrend; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const points = trend?.points ?? [];

  useEchartsRender<PlatformTrendPoint[]>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data: points,
    isEmpty: (d) => d.length === 0,
    emptyHTML: '<div class="' + styles.trendChartBoxEmpty + '">暂无数据</div>',
    buildOption: (d) => {
      const dates = d.map((p) => p.date);
      const xhsData = d.map((p) => p.xiaohongshuCount);
      const dyData = d.map((p) => p.douyinCount);
      const xhsTraffic = d.map((p) => p.xiaohongshuTraffic);
      const dyTraffic = d.map((p) => p.douyinTraffic);
      const xhsLeads = d.map((p) => p.xiaohongshuLeads);
      const dyLeads = d.map((p) => p.douyinLeads);
      return {
        title: { text: '双平台作品量', textStyle: { fontSize: 14, fontWeight: 'normal' }, left: 'center' },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: any[]) => {
            if (!Array.isArray(params) || params.length === 0) return '';
            const idx = params[0].dataIndex;
            const date = dates[idx];
            const totalPosts = xhsData[idx] + dyData[idx];
            const totalTraffic = xhsTraffic[idx] + dyTraffic[idx];
            const totalLeads = xhsLeads[idx] + dyLeads[idx];
            const lines = params.map((p) => `${p.marker} ${p.seriesName}: ${p.value} 作品`);
            lines.push(`---`);
            lines.push(`日期：${date}`);
            lines.push(`总作品：${totalPosts}（小红书 ${xhsData[idx]} / 抖音 ${dyData[idx]}）`);
            lines.push(`总流量：${totalTraffic}`);
            lines.push(`总获客：${totalLeads}`);
            return lines.join('<br/>');
          },
        },
        legend: { data: ['小红书', '抖音'], bottom: 0 },
        color: ['#fa8c16', '#1677ff'],
        grid: { left: 48, right: 16, top: 36, bottom: 56 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0 } },
        yAxis: { type: 'value', name: '作品数' },
        series: [
          { name: '小红书', type: 'bar', data: xhsData, itemStyle: { color: '#fa8c16' } },
          { name: '抖音', type: 'bar', data: dyData, itemStyle: { color: '#1677ff' } },
        ],
      };
    },
    deps: [trend, loading, echartsReady, containerRef, chartRef],
  });

  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} className={styles.trendChartBox} />
    </Skeleton>
  );
}

export default PersonalDashboardBoard;
