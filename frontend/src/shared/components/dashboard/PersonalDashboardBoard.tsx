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
  Radio,
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
import dayjs from 'dayjs';
import type {
  EfficiencyAccount,
  PersonalMetric,
  PersonalOverviewResponse,
  PersonalPeriod,
  PersonalPlatform,
  PersonalRankingSort,
  PersonalRankingsResponse,
} from '@/shared/api/content';
import { QuickRangePicker, RANGE_PRESETS_FULL, isPresetMatch, type DateRangeValue } from '@/shared/components/date';
import type { PlatformDistributionItem, PlatformTrend, PlatformTrendPoint } from '@/shared/types/content';
import React, { useMemo, useState } from 'react';

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

export type OverviewMetricMode = 'traffic' | 'leads';

const METRIC_MODE_OPTIONS: { label: string; value: OverviewMetricMode; metric: PersonalMetric }[] = [
  { label: '流量筛选', value: 'traffic', metric: 'totalTraffic' },
  { label: '获客筛选', value: 'leads', metric: 'totalLeads' },
];

const PLATFORM_OPTIONS: { label: string; value: PersonalPlatform }[] = [
  { label: '全部', value: 'all' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
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

const OVERVIEW_CARD_KEYS_BY_MODE: Record<OverviewMetricMode, Array<keyof PersonalOverviewResponse['overview']>> = {
  traffic: ['monthPostCount', 'monthTraffic', 'monthLeadPostCount'],
  leads: ['monthLeadCount', 'monthLeadPostCount', 'totalLeads'],
};

// 个人看板默认时间范围 = 今日（与 RANGE_PRESETS_FULL 中 `today` 预设对齐：
// mode='calendar', unit='day' → [startOf('day'), now]）。
// 之前默认为本月，配合 Select 的"重复选同一项不触发 onChange"陷阱，
// 容易出现「我选了今日但看到的是 X 天前到今天」的体感 bug。
const DEFAULT_RANGE_VALUE: DateRangeValue = {
  start: dayjs().startOf('day'),
  end: dayjs(),
};

export function buildPersonalDashboardRangeQuery(range: DateRangeValue): {
  period?: PersonalPeriod;
  from?: string;
  to?: string;
} {
  if (!range) {
    return { period: 'month', from: undefined, to: undefined };
  }
  return {
    period: undefined,
    from: range.start.format('YYYY-MM-DD'),
    to: range.end.format('YYYY-MM-DD'),
  };
}

/**
 * 根据日期范围匹配预设，返回时间段描述标签（如"近3年"、"本月"等）
 */
function getTimeRangeLabel(range: DateRangeValue): string {
  if (!range) return '本月';
  const matched = RANGE_PRESETS_FULL.find((preset) =>
    isPresetMatch(range, preset.unit, preset.n, preset.mode)
  );
  return matched ? matched.label : '自定义';
}

export function getOverviewCardKeys(mode: OverviewMetricMode): Array<keyof PersonalOverviewResponse['overview']> {
  return OVERVIEW_CARD_KEYS_BY_MODE[mode];
}

export interface PersonalDashboardBoardProps {
  /** 不传时查当前运营（运营端），传值时查指定员工（主管端） */
  employeeId?: string;
  /** 是否显示「刷新」按钮 */
  showRefreshButton?: boolean;
}

export function PersonalDashboardBoard({ employeeId, showRefreshButton = true }: PersonalDashboardBoardProps) {
  const [metricMode, setMetricMode] = useState<OverviewMetricMode>('traffic');
  const [platform, setPlatform] = useState<PersonalPlatform>('all');
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_RANGE_VALUE);
  // OP-19 趋势周期：日/周/月（独立于上面 period）
  const [trendPeriod, setTrendPeriod] = useState<'day' | 'week' | 'month'>('day');
  const metric = METRIC_MODE_OPTIONS.find((item) => item.value === metricMode)?.metric ?? 'totalTraffic';
  const rangeQuery = useMemo(() => buildPersonalDashboardRangeQuery(dateRange), [dateRange]);

  const {
    overview,
    platformDist,
    platformTrend,
    rankings,
    loadingOverview,
    loadingDualPlatform,
    loadingRankings,
    error,
    refreshAll,
  } = usePersonalDashboardData({
    metric,
    platform,
    period: rangeQuery.period ?? 'month',
    from: rangeQuery.from,
    to: rangeQuery.to,
    trendPeriod,
    employeeId,
  });

  // 旧的三个 useEffect + useCallback 加载逻辑已下沉到 usePersonalDashboardData，组件只保留 UI 状态。

  const rankingNode = useMemo(() => {
    if (!overview || !overview.ranking) return <Empty description="暂无名次数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    const { rank, total, gapToPrev, metricValue } = overview.ranking;
    if (rank === null || rank === undefined) {
      return <Empty description="暂无足够数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }
    const metricLabel = METRIC_MODE_OPTIONS.find((m) => m.metric === overview.metrics)?.label ?? '指标';
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
            {gapToPrev > 0 ? `+${gapToPrev.toFixed(2)}` : '—'}
          </Typography.Text>
        </div>
      </div>
    );
  }, [overview]);

  const overviewCardsNode = useMemo(() => {
    if (!overview) return null;
    const cardKeys = new Set(getOverviewCardKeys(metricMode));
    const cards = OVERVIEW_CARDS.filter((card) => cardKeys.has(card.key));
    const timeLabel = getTimeRangeLabel(dateRange);
    return (
      <Row gutter={[12, 12]}>
        {cards.map((card) => {
          // 动态生成标题：将"本月"替换为实际时间段（如"近3年"）
          const displayTitle = card.title.startsWith('本月')
            ? card.title.replace('本月', timeLabel)
            : card.title;
          return (
            <Col key={card.key} xs={24} md={8}>
              <Card size="small" loading={loadingOverview} className={styles.overviewCard}>
                <Space size={4} align="center" className={styles.overviewCardHead}>
                  <span style={{ color: card.color, fontSize: 16 }}>{card.icon}</span>
                  <Typography.Text strong>{displayTitle}</Typography.Text>
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
          );
        })}
      </Row>
    );
  }, [overview, loadingOverview, metricMode, dateRange]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 顶部切换器 */}
      <Card size="small">
        <Space wrap size={12} style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size={8}>
            <Space size={4} align="center">
              <Typography.Text type="secondary">指标</Typography.Text>
              <Segmented
                value={metricMode}
                onChange={(v) => setMetricMode(v as OverviewMetricMode)}
                options={METRIC_MODE_OPTIONS}
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
              <QuickRangePicker
                value={dateRange}
                onChange={setDateRange}
                presets={RANGE_PRESETS_FULL}
                variant="select"
                selectPlaceholder="选择月份/区间"
                selectWidth={150}
                allowClear={false}
                pickerProps={{ size: 'small' }}
              />
            </Space>
          </Space>
          {showRefreshButton ? (
            <Button icon={<ReloadOutlined />} loading={loadingOverview || loadingDualPlatform} onClick={() => void refreshAll()}>
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
            <Row justify="center" style={{ marginBottom: 8 }}>
              <Space size={16}>
                <Space size={4} align="center">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#fa8c16' }} />
                  <Typography.Text style={{ fontSize: 13 }}>小红书</Typography.Text>
                </Space>
                <Space size={4} align="center">
                  <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#1677ff' }} />
                  <Typography.Text style={{ fontSize: 13 }}>抖音</Typography.Text>
                </Space>
              </Space>
            </Row>
            <Row gutter={[8, 8]}>
              <Col xs={24} sm={8}>
                <PlatformPieChart items={platformDist} metric="postCount" loading={loadingDualPlatform} />
              </Col>
              <Col xs={24} sm={8}>
                <PlatformPieChart items={platformDist} metric="traffic" loading={loadingDualPlatform} />
              </Col>
              <Col xs={24} sm={8}>
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
            <PlatformTrendLineChart trend={platformTrend} loading={loadingDualPlatform} />
          </Card>
        </Col>
      </Row>

      {/* v1.3 T3.1 三类作品占比饼图（人设贴/讨论贴/获客贴，替代旧的"作品/流量/客资"分类） */}
      <PostTypeSharePieCard items={platformDist} loading={loadingDualPlatform} platform={platform} onPlatformChange={setPlatform} />

      {/* v1.3 T3.3 获客趋势 + 流量趋势曲线（小红书/抖音/总和 三条） */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Space size={4} align="center">
                <LineChartOutlined />
                <Typography.Text strong>获客趋势</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {trendPeriod === 'day' ? '按日' : trendPeriod === 'week' ? '按周' : '按月'} · 小红书 / 抖音 / 总和
                </Typography.Text>
              </Space>
            }
          >
            <LeadTrendLineChart trend={platformTrend} loading={loadingDualPlatform} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Space size={4} align="center">
                <FundProjectionScreenOutlined />
                <Typography.Text strong>流量趋势</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {trendPeriod === 'day' ? '按日' : trendPeriod === 'week' ? '按周' : '按月'} · 小红书 / 抖音 / 总和
                </Typography.Text>
              </Space>
            }
          >
            <TrafficTrendLineChart trend={platformTrend} loading={loadingDualPlatform} />
          </Card>
        </Col>
      </Row>

      {/* v1.3 双平台数据分析面板（顶部 3 概览卡 + 3 榜单 Top 8） */}
      <PlatformAnalysisPanel
        rankings={rankings}
        platformDist={platformDist}
        loading={loadingRankings}
      />
    </Space>
  );
}

// ============ v1.3 OP-18 双平台饼状图（echarts） ============
const PLATFORM_COLOR_MAP: Record<string, string> = {
  小红书: '#fa8c16',
  抖音: '#1677ff',
};

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
        legend: { show: false },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            data: data.map((it) => ({
              ...it,
              itemStyle: { color: PLATFORM_COLOR_MAP[it.name] },
            })),
            label: {
              show: true,
              position: 'inside',
              formatter: '{d}%',
              fontSize: 13,
              fontWeight: 'bold',
              color: '#000',
            },
            labelLine: { show: false },
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

// ============ v1.3 OP-19 双平台作品量趋势图（echarts） ============
// v1.3 / OP-19 调整：原为柱状图（type: 'bar'），改为折线图（type: 'line'），
// 视觉上更贴合"趋势"语义，时间序列高低起伏更易感知。
// - smooth: true 让折线带弧度；symbol: 'circle' + symbolSize: 6 标出每点
// - axisPointer 由 'shadow' 改为 'line'（柱状才有 shadow，线图不合适）
// - 顶部双平台作品量 title 改为"双平台作品量趋势"与外层 Card 标题保持一致

function PlatformTrendLineChart({ trend, loading }: { trend?: PlatformTrend; loading: boolean }) {
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
        title: { text: '双平台作品量趋势', textStyle: { fontSize: 14, fontWeight: 'normal' }, left: 'center' },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
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
          {
            name: '小红书',
            type: 'line',
            data: xhsData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, color: '#fa8c16' },
            itemStyle: { color: '#fa8c16' },
          },
          {
            name: '抖音',
            type: 'line',
            data: dyData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, color: '#1677ff' },
            itemStyle: { color: '#1677ff' },
          },
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

// ============ v1.3 T3.1 三类型作品占比饼图（人设贴 / 讨论贴 / 获客贴） ============
// v1.3 T3.1 修复：原"三类型占比（作品 / 流量 / 客资）"是按指标维度切的，不是作品类型。
// 改用后端 platformDist[i].postTypes（按 post_type 分类）渲染，三扇区：
//   - 人设贴 (alias for 素人贴, 旧 schema 注释里叫"人设贴"，与 素人贴=SU_REN 等价)
//   - 讨论贴 (alias for 话题贴)
//   - 获客贴 (含历史 营销贴)
// 平台过滤由 scope 决定；scope='all' 时把两个平台 postTypes 累加。
// 当月内可能 "其他" 分类的 post_type（如 note/marketing/图文）会被后端 SQL 过滤掉，
// 因此三项之和可能 < postCount（差值显示在 tooltip 副标题中提示用户）。
type PostTypeSharePlatform = 'all' | '小红书' | '抖音';

const POST_TYPE_SHARE_PLATFORM_OPTIONS: { label: string; value: PersonalPlatform }[] = [
  { label: '全部', value: 'all' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
];

const POST_TYPE_SHARE_COLORS: Record<string, string> = {
  人设帖: '#722ed1',
  讨论帖: '#fa8c16',
  获客帖: '#52c41a',
};

const POST_TYPE_DISPLAY_ORDER = ['人设帖', '讨论帖', '获客帖'] as const;

function PostTypeSharePieCard({
  items,
  loading,
  platform,
  onPlatformChange,
}: {
  items: PlatformDistributionItem[];
  loading: boolean;
  platform: PersonalPlatform;
  onPlatformChange: (next: PersonalPlatform) => void;
}) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const scope = mapPersonalPlatformToSharePlatform(platform);

  // 聚合：把 scope 范围内的 postTypes 累加，按固定顺序输出
  const aggregated = useMemo(() => {
    const filtered = scope === 'all' ? items : items.filter((it) => it.platform === scope);
    const acc: Record<string, number> = { 人设帖: 0, 讨论帖: 0, 获客帖: 0 };
    let classifiedTotal = 0;
    for (const it of filtered) {
      const types = it.postTypes || [];
      for (const t of types) {
        const key = String(t.type || '');
        if (key in acc) {
          acc[key] += Number(t.count) || 0;
        }
      }
    }
    for (const v of Object.values(acc)) classifiedTotal += v;
    return { acc, classifiedTotal };
  }, [items, scope]);

  const data = useMemo(
    () => POST_TYPE_DISPLAY_ORDER.map((type) => ({
      name: type,
      value: aggregated.acc[type] || 0,
      color: POST_TYPE_SHARE_COLORS[type],
    })),
    [aggregated],
  );

  const isEmpty = data.every((d) => d.value === 0);

  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.every((it) => it.value === 0),
    emptyHTML: '<div class="' + styles.pieChartBoxEmpty + '">暂无数据</div>',
    buildOption: (d) => ({
      title: {
        text: '三类作品占比（人设帖 / 讨论帖 / 获客帖）',
        subtext: scope === 'all' ? '全部平台' : scope,
        textStyle: { fontSize: 14, fontWeight: 'normal' },
        subtextStyle: { fontSize: 11 },
        left: 'center',
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const total = d.reduce((s, it) => s + it.value, 0) || 1;
          const pct = ((params.value / total) * 100).toFixed(1);
          return `${params.name}：${params.value.toLocaleString()}（${pct}%）`;
        },
      },
      legend: { bottom: 0 },
      color: d.map((it) => it.color),
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          data: d.map((it) => ({ name: it.name, value: it.value })),
          label: {
            show: true,
            formatter: (p: any) => `${p.name}\n${p.value.toLocaleString()}`,
          },
        },
      ],
    }),
    deps: [data, isEmpty, echartsReady, containerRef, chartRef],
  });

  return (
    <Card
      size="small"
      title={
        <Space size={6} align="center">
          <PieChartOutlined />
          <Typography.Text strong>三类作品占比</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            人设贴 / 讨论贴 / 获客贴（{scope === 'all' ? '全部平台' : scope}）
          </Typography.Text>
        </Space>
      }
      extra={
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value as PersonalPlatform)}
          options={POST_TYPE_SHARE_PLATFORM_OPTIONS}
        />
      }
    >
      <Skeleton loading={loading} active>
        <div ref={containerRef} className={styles.pieChartBox} />
      </Skeleton>
    </Card>
  );
}

function mapPersonalPlatformToSharePlatform(platform: PersonalPlatform): PostTypeSharePlatform {
  if (platform === 'xiaohongshu') return '小红书';
  if (platform === 'douyin') return '抖音';
  return 'all';
}

// ============ v1.3 T3.3 获客趋势曲线（小红书 / 抖音 / 总和 三条） ============
// 数据源：usePersonalDashboardData().platformTrend.points 里的 xiaohongshuLeads / douyinLeads
// 总和 = xiaohongshuLeads + douyinLeads
function LeadTrendLineChart({ trend, loading }: { trend?: PlatformTrend; loading: boolean }) {
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
      const xhs = d.map((p) => p.xiaohongshuLeads);
      const dy = d.map((p) => p.douyinLeads);
      const total = d.map((p) => p.xiaohongshuLeads + p.douyinLeads);
      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
        },
        legend: { data: ['小红书', '抖音', '总和'], bottom: 0 },
        color: ['#fa8c16', '#1677ff', '#52c41a'],
        grid: { left: 48, right: 16, top: 28, bottom: 48 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0 } },
        yAxis: { type: 'value', name: '获客数' },
        series: [
          { name: '小红书', type: 'line', data: xhs, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: '#fa8c16' }, itemStyle: { color: '#fa8c16' } },
          { name: '抖音', type: 'line', data: dy, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: '#1677ff' }, itemStyle: { color: '#1677ff' } },
          { name: '总和', type: 'line', data: total, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, type: 'dashed', color: '#52c41a' }, itemStyle: { color: '#52c41a' } },
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

// ============ v1.3 T3.3 流量趋势曲线（小红书 / 抖音 / 总和 三条） ============
// 数据源：platformTrend.points.xiaohongshuTraffic / douyinTraffic
function TrafficTrendLineChart({ trend, loading }: { trend?: PlatformTrend; loading: boolean }) {
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
      const xhs = d.map((p) => p.xiaohongshuTraffic);
      const dy = d.map((p) => p.douyinTraffic);
      const total = d.map((p) => p.xiaohongshuTraffic + p.douyinTraffic);
      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line' },
        },
        legend: { data: ['小红书', '抖音', '总和'], bottom: 0 },
        color: ['#fa8c16', '#1677ff', '#fa541c'],
        grid: { left: 48, right: 16, top: 28, bottom: 48 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0 } },
        yAxis: { type: 'value', name: '流量' },
        series: [
          { name: '小红书', type: 'line', data: xhs, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: '#fa8c16' }, itemStyle: { color: '#fa8c16' } },
          { name: '抖音', type: 'line', data: dy, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: '#1677ff' }, itemStyle: { color: '#1677ff' } },
          { name: '总和', type: 'line', data: total, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, type: 'dashed', color: '#fa541c' }, itemStyle: { color: '#fa541c' } },
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
