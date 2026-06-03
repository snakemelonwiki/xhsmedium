'use client';

import { FundOutlined, SelectOutlined, TeamOutlined } from '@ant-design/icons';
import { Card, Col, Row, Select, Skeleton, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';

import { getSupervisorAnalysis, type SupervisorAnalysis } from '@/shared/api/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const echarts: any;

type PlatformFilter = '' | '小红书' | '抖音';

const PLATFORM_OPTIONS = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

function buildLineOption(title: string, dates: string[], series: { name: string; data: number[] }[]): any {
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

function PlatformTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !containerRef.current) return;
    if (!analysis?.platformTrend?.length) {
      containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">暂无数据</div>';
      return;
    }
    const dates = [...new Set(analysis.platformTrend.map((r) => r.date))].sort();
    const xhsData = dates.map((d) => {
      const row = analysis.platformTrend.find((r) => r.date === d && r.platform === '小红书');
      return row?.postCount ?? 0;
    });
    const dyData = dates.map((d) => {
      const row = analysis.platformTrend.find((r) => r.date === d && r.platform === '抖音');
      return row?.postCount ?? 0;
    });
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chart.setOption(buildLineOption('平台趋势（作品数）', dates, [
      { name: '小红书', data: xhsData },
      { name: '抖音', data: dyData },
    ]));
    return () => { chart.dispose(); };
  }, [loading, analysis]);

  return (
    <Card title={<><FundOutlined /> 平台趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <Skeleton loading={loading} active>
        <div ref={containerRef} style={{ width: '100%', height: 280 }} />
      </Skeleton>
    </Card>
  );
}

function PostStructureChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !containerRef.current) return;
    if (!analysis?.postStructure?.length) {
      containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">暂无数据</div>';
      return;
    }
    const data = analysis.postStructure.map((r) => ({ name: r.type, value: r.count }));
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chart.setOption(buildPieOption('作品结构', data));
    return () => { chart.dispose(); };
  }, [loading, analysis]);

  return (
    <Card title={<><TeamOutlined /> 作品结构</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <Skeleton loading={loading} active>
        <div ref={containerRef} style={{ width: '100%', height: 280 }} />
      </Skeleton>
    </Card>
  );
}

function LeadTrendChart({ analysis, loading }: { analysis?: SupervisorAnalysis; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !containerRef.current) return;
    if (!analysis?.leadTrend?.length) {
      containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">暂无数据</div>';
      return;
    }
    const dates = [...new Set(analysis.leadTrend.map((r) => r.date))].sort();
    const xhsData = dates.map((d) => {
      const row = analysis.leadTrend.find((r) => r.date === d && r.platform === '小红书');
      return row?.leadCount ?? 0;
    });
    const dyData = dates.map((d) => {
      const row = analysis.leadTrend.find((r) => r.date === d && r.platform === '抖音');
      return row?.leadCount ?? 0;
    });
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chart.setOption(buildLineOption('客资趋势（新增客资数）', dates, [
      { name: '小红书', data: xhsData },
      { name: '抖音', data: dyData },
    ]));
    return () => { chart.dispose(); };
  }, [loading, analysis]);

  return (
    <Card title={<><FundOutlined /> 客资趋势</>} styles={{ body: { padding: '12px 12px 0' } }}>
      <Skeleton loading={loading} active>
        <div ref={containerRef} style={{ width: '100%', height: 280 }} />
      </Skeleton>
    </Card>
  );
}

export default function AdminAnalyticsPage() {
  const [analysis, setAnalysis] = useState<SupervisorAnalysis | undefined>();
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<PlatformFilter>('');

  useEffect(() => {
    setLoading(true);
    getSupervisorAnalysis({ platform: platform || undefined })
      .then(setAnalysis)
      .catch(() => setAnalysis(undefined))
      .finally(() => setLoading(false));
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
          <Select
            value={platform}
            onChange={(v) => setPlatform(v as PlatformFilter)}
            options={PLATFORM_OPTIONS}
            style={{ width: 140 }}
            suffixIcon={<SelectOutlined />}
          />
        </Space>
      </div>

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
