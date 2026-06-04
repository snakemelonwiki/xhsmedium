'use client';

import { FundOutlined, SelectOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Empty, Row, Select, Skeleton, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getSupervisorAnalysis, type SupervisorAnalysis } from '@/shared/api/admin';

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

  // echarts 通过 layout.tsx 注入的 CDN script 暴露为 window.echarts，
  // 它的加载晚于组件首次渲染，需要等 ready=true 后再 init，避免 ReferenceError。
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
    // 从实际数据中提取出现的平台，避免切到单平台时仍硬编码两条 series
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

export default function AdminAnalyticsPage() {
  const [analysis, setAnalysis] = useState<SupervisorAnalysis | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [platform, setPlatform] = useState<PlatformFilter>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // 切平台时立即取消上一次请求，避免旧响应覆盖新状态
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(undefined);
    getSupervisorAnalysis({ platform: platform || undefined }, { signal: ctrl.signal })
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
  }, [platform]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>分析看板</Typography.Title>
          <Typography.Paragraph type="secondary">
            主管视角核心指标趋势、作品结构与客资走势分析。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap align="center">
          <Tag color="purple">主管</Tag>
          <Select
            value={platform}
            onChange={(v) => setPlatform(v as PlatformFilter)}
            options={PLATFORM_OPTIONS}
            style={{ width: 140 }}
            suffixIcon={<SelectOutlined />}
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
    </Space>
  );
}
