'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthExpiredError } from '@/shared/api/apiClient';
import {
  getPersonalOverview,
  getPersonalPlatformDistribution,
  getPersonalPlatformTrend,
  getPersonalRankings,
  type PersonalMetric,
  type PersonalOverviewResponse,
  type PersonalPeriod,
  type PersonalPlatform,
  type PersonalRankingSort,
  type PersonalRankingsResponse,
} from '@/shared/api/content';
import type { PlatformDistributionItem, PlatformTrend } from '@/shared/types/content';

/**
 * 把 AuthExpiredError（401 登录失效）映射成友好文案。
 * 仪表板是只读视图，错误不应阻塞页面，用户可重试或刷新。
 *
 * 注意：空数据（200 返回空数组）不会进入此函数，各组件会显示"暂无数据"。
 * 只有真正的错误（401/403/500/网络错误）才会调用此函数。
 */
export function normalizeDashboardError(err: unknown): string {
  if (err instanceof AuthExpiredError) {
    return '登录已失效，请刷新页面或重新登录';
  }
  if (err instanceof Error) return err.message;
  return '数据加载失败，请稍后重试';
}

/** 按 OP-1 时间切换器返回日期范围（前端只用来作为 OP-18/19 图表的 from/to 上界）。 */
function resolvePeriodRange(period: PersonalPeriod): { from: string; to: string } {
  // 注意：浏览器 / Node 在测试环境下 dayjs 可能不可用，这里采用本地 Date 计算避免依赖
  const today = new Date().toISOString().slice(0, 10);
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const d = new Date();
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case 'month': {
      const d = new Date();
      d.setDate(1);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case 'all':
    default:
      return { from: '1970-01-01', to: today };
  }
}

export interface UsePersonalDashboardParams {
  metric: PersonalMetric;
  platform: PersonalPlatform;
  period: PersonalPeriod;
  /** v1.3 OP-19 趋势周期：日/周/月（独立于 period） */
  trendPeriod: 'day' | 'week' | 'month';
  rankingSort: PersonalRankingSort;
  /** 不传时查当前运营（运营端），传值时查指定员工（主管端） */
  employeeId?: string;
}

export interface UsePersonalDashboardResult {
  overview: PersonalOverviewResponse | undefined;
  rankings: PersonalRankingsResponse | undefined;
  platformDist: PlatformDistributionItem[];
  platformTrend: PlatformTrend | undefined;
  loadingOverview: boolean;
  loadingRankings: boolean;
  loadingDualPlatform: boolean;
  error: string | undefined;
  refreshAll: () => Promise<void>;
}

/**
 * 主管/运营个人看板的统一数据获取层：把原先散落在 PersonalDashboardBoard 中的
 * 三个 useEffect + 三个 useCallback 合并到这里，组件只关心渲染与交互。
 *
 * 旧版每个 useEffect 触发单一请求；新版同样依赖驱动，但所有 state 集中、错误归一化
 * 集中（避免三处各自 `setError` 不一致）。
 */
export function usePersonalDashboardData(params: UsePersonalDashboardParams): UsePersonalDashboardResult {
  const { metric, platform, period, trendPeriod, rankingSort, employeeId } = params;

  const [overview, setOverview] = useState<PersonalOverviewResponse | undefined>();
  const [rankings, setRankings] = useState<PersonalRankingsResponse | undefined>();
  // v1.3 OP-18/19 双平台图表数据
  const [platformDist, setPlatformDist] = useState<PlatformDistributionItem[]>([]);
  const [platformTrend, setPlatformTrend] = useState<PlatformTrend | undefined>();
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [loadingDualPlatform, setLoadingDualPlatform] = useState(false);
  const [error, setError] = useState<string>();

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(undefined);
    try {
      const data = await getPersonalOverview({ metrics: metric, platform, period, employeeId });
      setOverview(data);
    } catch (err) {
      setOverview(undefined);
      setError(normalizeDashboardError(err));
    } finally {
      setLoadingOverview(false);
    }
  }, [metric, platform, period, employeeId]);

  const loadRankings = useCallback(async () => {
    setLoadingRankings(true);
    try {
      const data = await getPersonalRankings({ platform, period, employeeId, sort: rankingSort });
      setRankings(data);
    } catch (err) {
      setRankings(undefined);
      setError((prev) => prev ?? normalizeDashboardError(err));
    } finally {
      setLoadingRankings(false);
    }
  }, [platform, period, employeeId, rankingSort]);

  // v1.3 OP-18/19 双平台数据：使用 period 计算的 from/to
  const dualRange = useMemo(() => {
    const range = resolvePeriodRange(period);
    return { from: range.from, to: range.to };
  }, [period]);

  const loadDualPlatform = useCallback(async () => {
    setLoadingDualPlatform(true);
    try {
      const [dist, trend] = await Promise.all([
        getPersonalPlatformDistribution({ from: dualRange.from, to: dualRange.to, platform, employeeId }),
        getPersonalPlatformTrend({ period: trendPeriod, from: dualRange.from, to: dualRange.to, employeeId }),
      ]);
      setPlatformDist(dist);
      setPlatformTrend(trend);
      // 空数据不算错误，各组件自己处理空状态（饼图/柱状图有 isEmpty + emptyHTML）
    } catch (err) {
      setPlatformDist([]);
      setPlatformTrend(undefined);
      // 只有真正的错误（401/403/500/网络错误）才设置error
      // 空数据（200返回空数组）不设置error
      setError((prev) => prev ?? normalizeDashboardError(err));
    } finally {
      setLoadingDualPlatform(false);
    }
  }, [dualRange.from, dualRange.to, platform, trendPeriod, employeeId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadRankings();
  }, [loadRankings]);

  useEffect(() => {
    void loadDualPlatform();
  }, [loadDualPlatform]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadRankings(), loadDualPlatform()]);
  }, [loadOverview, loadRankings, loadDualPlatform]);

  return {
    overview,
    rankings,
    platformDist,
    platformTrend,
    loadingOverview,
    loadingRankings,
    loadingDualPlatform,
    error,
    refreshAll,
  };
}
