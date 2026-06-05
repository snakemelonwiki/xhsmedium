'use client';

import { useEffect, useRef, useState } from 'react';

// echarts 通过 layout.tsx 注入的 CDN script 暴露为 window.echarts，
// 它的加载晚于组件首次渲染，需要在 useEffect 内等 ready 后再 init，
// 避免 dev 模式 HMR 偶发丢失全局变量导致 ReferenceError。
// 参考 admin/analytics/page.tsx 的 EChart 容器实现。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const echarts: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EchartInstance = any;

export interface UseEchartsChartResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  chartRef: React.MutableRefObject<EchartInstance | null>;
  echartsReady: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EChartOption = any;

export interface UseEchartsRenderParams<T> {
  /** echarts 全局是否就绪（来自 useEchartsChart） */
  ready: boolean;
  /** 图表容器 ref（来自 useEchartsChart） */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 图表实例 ref（来自 useEchartsChart） */
  chartRef: React.MutableRefObject<EchartInstance | null>;
  /** 图表绑定的业务数据（用于判断是否为空 & 构建 option） */
  data: T;
  /** 判断 data 是否为空；为空时显示 emptyHTML 而不渲染 echarts */
  isEmpty: (d: T) => boolean;
  /** data 为空时容器内插入的 HTML（字符串或带 class 的 div 字符串） */
  emptyHTML: string;
  /** 用 data 构造 echarts setOption 的 option 对象 */
  buildOption: (d: T) => EChartOption;
  /** useEffect 依赖（通常包含 [data, ready, ...]） */
  deps: ReadonlyArray<unknown>;
}

/**
 * 主管/运营个人看板共用的 echarts 容器生命周期：等待 window.echarts 就绪后
 * 创建实例，组件卸载时 dispose。每次 ready 后由调用方在 effect 内执行 setOption。
 *
 * 旧版在 PlatformPieChart / PlatformTrendBarChart 各自拷贝了同一段 polling 逻辑，
 * 容易漂移；集中后保持行为完全一致。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEchartsChart(): UseEchartsChartResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  useEffect(() => () => {
    chartRef.current?.dispose?.();
    chartRef.current = null;
  }, []);

  return { containerRef, chartRef, echartsReady };
}

/**
 * 通用 echarts 渲染 effect：消除「if empty / if not init / setOption / dispose」四段重复。
 * - data 空 → 容器 innerHTML 写为 emptyHTML，并 dispose 已存在的实例
 * - data 非空 → 必要时 init，然后 setOption(buildOption(data))
 * 调用方只需传 data / isEmpty / emptyHTML / buildOption，JSX 保持 <Skeleton><div ref/></Skeleton> 不变。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEchartsRender<T>(params: UseEchartsRenderParams<T>): void {
  const { ready, containerRef, chartRef, data, isEmpty, emptyHTML, buildOption, deps } = params;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    if (isEmpty(data)) {
      containerRef.current.innerHTML = emptyHTML;
      chartRef.current?.dispose?.();
      chartRef.current = null;
      return;
    }
    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    }
    chartRef.current.setOption(buildOption(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
