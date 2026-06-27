'use client';

import { Spin } from 'antd';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { CSSProperties, ImgHTMLAttributes } from 'react';

type LazyImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> & {
  /** 加载占位符的背景色（默认 #f5f5f5） */
  placeholderBg?: string;
  /** 图片加载失败时的回退背景色（默认 #f0f0f0） */
  errorBg?: string;
  /** 是否显示加载动画（默认 true） */
  showLoading?: boolean;
  /** 自定义加载占位符 */
  placeholder?: React.ReactNode;
};

const wrapperStyleBase: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const imgStyleBase: CSSProperties = {
  display: 'block',
  transition: 'opacity 0.35s ease',
};

/** 应作用于 wrapper <div> 的布局属性白名单 */
const WRAPPER_KEYS = new Set<string>([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'position', 'top', 'bottom', 'left', 'right',
  'display', 'float', 'clear', 'zIndex',
  'borderRadius', 'aspectRatio',
]);

/** 应作用于 <img> 的图片渲染属性白名单 */
const IMG_KEYS = new Set<string>([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'objectFit', 'objectPosition',
  'filter', 'transform', 'transformOrigin',
  'clipPath', 'maskImage', 'maskSize', 'maskPosition',
]);

/** 将 style 拆分为 wrapper 布局和 img 渲染两部分 */
function splitStyle(style: CSSProperties | undefined): [CSSProperties, CSSProperties] {
  if (!style) return [{}, {}];
  const wrapper: CSSProperties = {};
  const img: CSSProperties = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    if (WRAPPER_KEYS.has(key)) {
      (wrapper as Record<string, unknown>)[key] = value;
      // 尺寸属性（width/height 等）需要同时作用于 img，
      // 以确保 objectFit 能基于正确的容器尺寸进行缩放
      if (key.startsWith('width') || key.startsWith('height') || key.startsWith('min') || key.startsWith('max')) {
        (img as Record<string, unknown>)[key] = value;
      }
    } else if (IMG_KEYS.has(key)) {
      (img as Record<string, unknown>)[key] = value;
    }
    // 其余属性不应用到任何元素，避免布局泄漏
  }
  return [wrapper, img];
}

/**
 * 异步懒加载图片组件，带加载动画。
 *
 * 特性：
 * - `loading="lazy"` + `decoding="async"` 避免同时发出大量请求打满浏览器并发池
 * - src 变化时自动重置加载状态，列表/分页切换体验正确
 * - 浏览器缓存导致 `onLoad` 不触发时，通过 `img.complete` 立即显示
 * - 加载中显示 Spin 占位符，加载完成后淡入
 * - 加载失败显示灰色背景并隐藏裂图，避免布局跳动
 *
 * 用法：直接替换 `<img>` 标签即可，props 与原生 img 基本一致。
 * `style` 中的布局属性（width/height 等）作用于外层 wrapper，渲染属性（objectFit 等）作用于 img。
 */
export function LazyImage({
  placeholderBg = '#f5f5f5',
  errorBg = '#f0f0f0',
  showLoading = true,
  placeholder,
  style,
  className,
  ...imgProps
}: LazyImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(true);
    setError(true);
  }, []);

  /**
   * P0: src 变化时重置加载状态，并处理浏览器缓存。
   *
   * 当列表分页、Tab 切换导致 src 变化时，必须重新显示 loading 占位。
   * 同时检查 img.complete：若新 src 已被缓存，浏览器可能跳过 onLoad，
   * 需手动触发 setLoaded(true) 避免图片永远不可见。
   */
  useEffect(() => {
    setLoaded(false);
    setError(false);

    const img = imgRef.current;
    if (img && img.complete && imgProps.src) {
      // 使用 requestAnimationFrame 确保在 React 完成 DOM 更新后检查
      // 避免在严格模式 double mount 时读取到旧 ref
      requestAnimationFrame(() => {
        // 二次确认：ref 仍然指向当前元素且 src 未变
        if (imgRef.current === img && img.complete && img.src === imgProps.src) {
          setLoaded(true);
        }
      });
    }
  }, [imgProps.src]);

  const [wrapperLayout, imgRenderStyle] = useMemo(() => splitStyle(style), [style]);

  const wrapperStyle: CSSProperties = {
    ...wrapperStyleBase,
    backgroundColor: error ? errorBg : placeholderBg,
    ...wrapperLayout,
  };

  const imgStyle: CSSProperties = {
    ...imgStyleBase,
    opacity: loaded && !error ? 1 : 0,
    ...imgRenderStyle,
  };

  return (
    <div style={wrapperStyle} className={className}>
      {!loaded && showLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          {placeholder ?? <Spin size="small" />}
        </div>
      )}
      <img
        {...imgProps}
        ref={imgRef}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        style={imgStyle}
      />
    </div>
  );
}
