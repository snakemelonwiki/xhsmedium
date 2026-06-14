'use client';

import {
  FundOutlined,
  PercentageOutlined,
  SelectOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Card, Col, Empty, Row, Select, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getSupervisorAnalysis,
  listAdminAccounts,
  type SupervisorAnalysis,
} from '@/shared/api/admin';
import type { AdminAccount } from '@/shared/types/admin';
import { QuickRangePicker, type DateRangeValue } from '@/shared/components/date';
import { isPresetMatch, type DateRangePreset } from '@/shared/utils/date-range';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const echarts: any;

type PlatformFilter = '' | '小红书' | '抖音';

const PLATFORM_OPTIONS = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const PLATFORM_COLORS: Record<string, string> = {
  小红书: '#fa8c16',
  抖音: '#1677ff',
};

// T6.2 时段预设：今日 / 本周 / 本月 + 自定义（与主管端 dashboard 的 OVERVIEW_PRESETS 对齐）
const ANALYTICS_PRESETS: ReadonlyArray<DateRangePreset> = [
  { key: 'today', label: '今日', unit: 'day', n: 1, mode: 'calendar' },
  { key: 'thisWeek', label: '本周', unit: 'week', n: 1, mode: 'calendar' },
  { key: 'thisMonth', label: '本月', unit: 'month', n: 1, mode: 'calendar' },
];

function buildLineOption(
  title: string,
  dates: string[],
  series: { name: string; data: number[]; color: string }[],
): any {
  return {
    title: { text: title, textStyle: { fontSize: 14, fontWeight: 'normal' }, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: series.map((s) => s.name), bottom: 0 },
    grid: { left: 48, right: 16, top: 36, bottom: 56 },
    xAxis: { type: 'category', data: dates, boundaryGap: false },
    yAxis: { type: 'value' },
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      showSymbol: false,
      itemStyle: { color: s.color },
    })),
  };
}

function buildPieOption(title: string, data: { name: string; value: number }[]): any {
  return {
    title: { text: title, textStyle: { fontSize: 14, fontWeight: 'normal' }, left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: data.map((d) => ({ name: d.name, value: d.value })),
        label: { show: true, formatter: '{b}: {c}' },
      },
    ],
  };
}

/**
 * 通用 echarts 容器：用 ref 持有 chart 实例避免重复 init，
 * option 变化时 setOption 复用，option 变 undefined 或卸载时 dispose。
 * 不再 innerHTML 写占位，避免破坏 React DOM 与 echarts 实例状态。
 */
function EChart({ option, height, loading }: { option?: any; height: number; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [echartsReady, setEchartsReady] = useState(false);

  useEffect(() => {
    if (typeof echarts === 'undefined') {
      const timer = window.setInterval(() => {
        if (typeof echarts !== 'undefined') {
          setEchartsReady(true);
          window.clearInterval(timer);
        }
      }, 50);
      return () => window.clearInterval(timer);
    }
    setEchartsReady(true);
    return undefined;
  }, []);

  useEffect(() => {
    if (!echartsReady) return;
    if (!containerRef.current) return;
    if (!option) {
      chartRef.current?.dispose();
      chartRef.current = null;
      return;
    }
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    }
    chartRef.current.setOption(option, true);
  }, [option, echartsReady]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  return (
    <Skeleton loading={loading} active>
      {option && echartsReady ? (
        <div ref={containerRef} style={{ width: '100%', height }} />
      ) : (
        <div
          style={{
            width: '100%',
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
          }}
        >
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
        </div>
      )}
    </Skeleton>
  );
}

function PlatformTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const option = useMemo(() => {
    const rows = analysis?.platformTrend ?? [];
    if (rows.length === 0) return undefined;
    const platforms = Array.from(new Set(rows.map((r) => r.platform))).sort();
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const series = platforms.map((p) => ({
      name: p,
      color: PLATFORM_COLORS[p] ?? '#999',
      data: dates.map((d) => rows.find((r) => r.date === d && r.platform === p)?.postCount ?? 0),
    }));
    return buildLineOption('平台趋势（作品数）', dates, series);
  }, [analysis]);

  return (
    <Card title={<><FundOutlined /> 平台趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

function PostStructureChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const option = useMemo(() => {
    const rows = analysis?.postStructure ?? [];
    if (rows.length === 0) return undefined;
    return buildPieOption('作品结构', rows.map((r) => ({ name: r.type, value: r.count })));
  }, [analysis]);

  return (
    <Card title={<><TeamOutlined /> 作品结构</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

function LeadTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const option = useMemo(() => {
    const rows = analysis?.leadTrend ?? [];
    if (rows.length === 0) return undefined;
    const platforms = Array.from(new Set(rows.map((r) => r.platform))).sort();
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const series = platforms.map((p) => ({
      name: p,
      color: PLATFORM_COLORS[p] ?? '#999',
      data: dates.map((d) => rows.find((r) => r.date === d && r.platform === p)?.leadCount ?? 0),
    }));
    return buildLineOption('客资趋势（新增客资数）', dates, series);
  }, [analysis]);

  return (
    <Card title={<><FundOutlined /> 客资趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

// T6.3 流量趋势曲线：3 个 series（小红书 / 抖音 / 总和）
function TrafficTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const option = useMemo(() => {
    const rows = analysis?.trafficTrend ?? [];
    if (rows.length === 0) return undefined;
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const totalSeries = dates.map((d) =>
      rows.filter((r) => r.date === d).reduce((s, r) => s + r.traffic, 0),
    );
    const xhsData = dates.map((d) => rows.find((r) => r.date === d && r.platform === '小红书')?.traffic ?? 0);
    const dyData = dates.map((d) => rows.find((r) => r.date === d && r.platform === '抖音')?.traffic ?? 0);
    return buildLineOption('流量趋势', dates, [
      { name: '小红书', color: PLATFORM_COLORS.小红书, data: xhsData },
      { name: '抖音', color: PLATFORM_COLORS.抖音, data: dyData },
      { name: '总和', color: '#722ed1', data: totalSeries },
    ]);
  }, [analysis]);

  return (
    <Card title={<><ThunderboltOutlined /> 流量趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

// T6.3 获客效率趋势：客资数 / 作品数（每天）
function EfficiencyTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const option = useMemo(() => {
    const rows = analysis?.efficiencyTrend ?? [];
    if (rows.length === 0) return undefined;
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const xhsData = dates.map((d) => {
      const r = rows.find((it) => it.date === d && it.platform === '小红书');
      return r ? r.efficiency : 0;
    });
    const dyData = dates.map((d) => {
      const r = rows.find((it) => it.date === d && it.platform === '抖音');
      return r ? r.efficiency : 0;
    });
    const totalData = dates.map((d) => {
      const xhs = rows.find((it) => it.date === d && it.platform === '小红书');
      const dy = rows.find((it) => it.date === d && it.platform === '抖音');
      const totalPosts = (xhs?.postCount ?? 0) + (dy?.postCount ?? 0);
      const totalLeads = (xhs?.leadCount ?? 0) + (dy?.leadCount ?? 0);
      return totalPosts > 0 ? Number((totalLeads / totalPosts).toFixed(2)) : 0;
    });
    return buildLineOption('获客效率趋势（客资/作）', dates, [
      { name: '小红书', color: PLATFORM_COLORS.小红书, data: xhsData },
      { name: '抖音', color: PLATFORM_COLORS.抖音, data: dyData },
      { name: '双平台综合', color: '#13c2c2', data: totalData },
    ]);
  }, [analysis]);

  return (
    <Card title={<><PercentageOutlined /> 获客效率趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

// T6.3 获客帖效率趋势：客资数 / 获客贴数（每天）
function LeadPostEfficiencyTrendChart({
  analysis,
  loading,
}: {
  analysis?: SupervisorAnalysis;
  loading: boolean;
}) {
  const option = useMemo(() => {
    const rows = analysis?.leadEfficiencyTrend ?? [];
    if (rows.length === 0) return undefined;
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const xhsData = dates.map((d) => {
      const r = rows.find((it) => it.date === d && it.platform === '小红书');
      return r ? r.efficiency : 0;
    });
    const dyData = dates.map((d) => {
      const r = rows.find((it) => it.date === d && it.platform === '抖音');
      return r ? r.efficiency : 0;
    });
    const totalData = dates.map((d) => {
      const xhs = rows.find((it) => it.date === d && it.platform === '小红书');
      const dy = rows.find((it) => it.date === d && it.platform === '抖音');
      const totalLeadPosts = (xhs?.leadPostCount ?? 0) + (dy?.leadPostCount ?? 0);
      const totalLeads = (xhs?.leadCount ?? 0) + (dy?.leadCount ?? 0);
      return totalLeadPosts > 0 ? Number((totalLeads / totalLeadPosts).toFixed(2)) : 0;
    });
    return buildLineOption('获客帖效率趋势（客资/获客贴）', dates, [
      { name: '小红书', color: PLATFORM_COLORS.小红书, data: xhsData },
      { name: '抖音', color: PLATFORM_COLORS.抖音, data: dyData },
      { name: '双平台综合', color: '#52c41a', data: totalData },
    ]);
  }, [analysis]);

  return (
    <Card title={<><PercentageOutlined /> 获客帖效率趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <EChart option={option} height={280} loading={loading} />
    </Card>
  );
}

// T6.4 运营发帖数 / 获客数 比值（按员工聚合）
function EfficiencyRatioSection({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const rows = analysis?.efficiencyRatio ?? [];
  const totalPosts = rows.reduce((s, r) => s + r.postCount, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leadCount, 0);
  const ratio = totalPosts > 0 ? Number((totalLeads / totalPosts).toFixed(2)) : 0;

  return (
    <Card title={<>运营发帖数 / 获客数 比值</>}>
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} md={8}>
            <Statistic
              title="比值（客资/作）"
              value={ratio}
              precision={2}
              valueStyle={{ color: '#13c2c2' }}
              prefix={<PercentageOutlined />}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              区间内：{totalPosts} 作品 / {totalLeads} 客资
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={16}>
            <EChart
              option={
                rows.length > 0
                  ? {
                      tooltip: { trigger: 'axis' },
                      grid: { left: 48, right: 16, top: 16, bottom: 56 },
                      xAxis: { type: 'category', data: rows.map((r) => r.name || r.employeeId) },
                      yAxis: { type: 'value' },
                      series: [
                        {
                          name: '客资/作',
                          type: 'bar',
                          data: rows.map((r) => (r.postCount > 0 ? Number((r.leadCount / r.postCount).toFixed(2)) : 0)),
                          itemStyle: { color: '#13c2c2' },
                        },
                      ],
                    }
                  : undefined
              }
              height={240}
              loading={false}
            />
          </Col>
        </Row>
      </Skeleton>
    </Card>
  );
}

// T6.4 获客帖数 / 获客数 比值（按员工聚合）
function LeadPostRatioSection({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const rows = analysis?.leadPostRatio ?? [];
  const totalLeadPosts = rows.reduce((s, r) => s + r.leadPostCount, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leadCount, 0);
  const ratio = totalLeadPosts > 0 ? Number((totalLeads / totalLeadPosts).toFixed(2)) : 0;

  return (
    <Card title={<>获客帖 / 获客数 比值</>}>
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} md={8}>
            <Statistic
              title="比值（客资/获客贴）"
              value={ratio}
              precision={2}
              valueStyle={{ color: '#52c41a' }}
              prefix={<PercentageOutlined />}
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              区间内：{totalLeadPosts} 获客贴 / {totalLeads} 客资
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={16}>
            <EChart
              option={
                rows.length > 0
                  ? {
                      tooltip: { trigger: 'axis' },
                      grid: { left: 48, right: 16, top: 16, bottom: 56 },
                      xAxis: { type: 'category', data: rows.map((r) => r.name || r.employeeId) },
                      yAxis: { type: 'value' },
                      series: [
                        {
                          name: '客资/获客贴',
                          type: 'bar',
                          data: rows.map((r) =>
                            r.leadPostCount > 0 ? Number((r.leadCount / r.leadPostCount).toFixed(2)) : 0,
                          ),
                          itemStyle: { color: '#52c41a' },
                        },
                      ],
                    }
                  : undefined
              }
              height={240}
              loading={false}
            />
          </Col>
        </Row>
      </Skeleton>
    </Card>
  );
}

export default function AdminAnalyticsPage() {
  const [analysis, setAnalysis] = useState<SupervisorAnalysis | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [platform, setPlatform] = useState<PlatformFilter>('');
  // T6.2 单账号维度：'all' = 全员；其他 = 具体 accountId
  const [accountId, setAccountId] = useState<string>('all');
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  // T6.2 时段选择
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    start: dayjs().startOf('day'),
    end: dayjs(),
  });
  const abortRef = useRef<AbortController | null>(null);

  // T6.2 加载账号下拉（取所有账号，前端按需过滤）
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    listAdminAccounts({ page: 1, pageSize: 500, limit: 500 })
      .then((res) => {
        if (cancelled) return;
        setAccounts(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 切换平台 / 账号 / 时段都重发请求；AbortController 取消旧请求
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(undefined);

    const from = dateRange ? dateRange.start.format('YYYY-MM-DD') : dayjs().startOf('day').format('YYYY-MM-DD');
    const to = dateRange ? dateRange.end.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const matched = ANALYTICS_PRESETS.find((p) => isPresetMatch(dateRange, p.unit, p.n, p.mode));

    // T6.2 单账号维度：'all' 翻译成空串让后端跳过过滤
    const effectiveAccountId = accountId && accountId !== 'all' ? accountId : '';
    const params: Record<string, string> = {
      platform: platform || '',
      accountId: effectiveAccountId,
      employeeId: '',
      from,
      to,
      period: matched ? matched.key : 'custom',
    };
    getSupervisorAnalysis(params, { signal: ctrl.signal })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setAnalysis(data);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setAnalysis(undefined);
        setError(err instanceof Error ? err.message : '分析数据加载失败');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [platform, accountId, dateRange]);

  const accountOptions = useMemo(() => {
    const items = [{ label: '全部账号', value: 'all' }];
    for (const a of accounts) {
      const name = a.accountName.trim() || '未命名账号';
      const emp = a.employeeName ? `（${a.employeeName}）` : '';
      const platformTag = a.platform ? ` [${a.platform}]` : '';
      items.push({ label: `${name}${platformTag}${emp}`, value: a.id });
    }
    return items;
  }, [accounts]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>分析看板</Typography.Title>
          <Typography.Paragraph type="secondary">
            主管视角核心指标趋势、作品结构、客资走势、流量与获客效率分析；支持按账号 / 时段筛选。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap align="center">
          <Tag color="purple">主管</Tag>
          <Select
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            loading={accountsLoading}
            style={{ minWidth: 220 }}
            placeholder="选择账号"
            suffixIcon={<UserOutlined />}
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={platform}
            onChange={(v) => setPlatform(v as PlatformFilter)}
            options={PLATFORM_OPTIONS}
            style={{ width: 140 }}
            suffixIcon={<SelectOutlined />}
          />
          <QuickRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={ANALYTICS_PRESETS}
            variant="buttons"
            presetSize="small"
          />
        </Space>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="分析数据暂不可用" description={error} />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <PlatformTrendChart analysis={analysis} loading={loading} />
        </Col>
        <Col xs={24} lg={8}>
          <PostStructureChart analysis={analysis} loading={loading} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <LeadTrendChart analysis={analysis} loading={loading} />
        </Col>
      </Row>

      {/* T6.3 三条新曲线 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <TrafficTrendChart analysis={analysis} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <EfficiencyTrendChart analysis={analysis} loading={loading} />
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <LeadPostEfficiencyTrendChart analysis={analysis} loading={loading} />
        </Col>
      </Row>

      {/* T6.4 搬移中台总览的两个比值看板 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <EfficiencyRatioSection analysis={analysis} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <LeadPostRatioSection analysis={analysis} loading={loading} />
        </Col>
      </Row>
    </Space>
  );
}
