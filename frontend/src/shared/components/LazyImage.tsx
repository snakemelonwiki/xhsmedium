'use client';

import { Spin } from 'antd';
import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ImgHTMLAttributes } from 'react';

type LazyImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'> & {
  /** 加载占位符的背景色 */
  placeholderBg?: string;
  /** 图片加载失败时的回退背景色 */
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

/** 从 style 中提取应作用于 wrapper 的布局属性 */
function extractWrapperStyle(style: CSSProperties | undefined): CSSProperties {
  if (!style) return {};
  const {
    width, height, minWidth, minHeight, maxWidth, maxHeight,
    margin, marginTop, marginBottom, marginLeft, marginRight,
    padding, paddingTop, paddingBottom, paddingLeft, paddingRight,
    flex, flexGrow, flexShrink, flexBasis,
    position, top, bottom, left, right,
    display, float, clear, zIndex,
    borderRadius, aspectRatio,
    ...rest
  } = style;
  return {
    width, height, minWidth, minHeight, maxWidth, maxHeight,
    margin, marginTop, marginBottom, marginLeft, marginRight,
    padding, paddingTop, paddingBottom, paddingLeft, paddingRight,
    flex, flexGrow, flexShrink, flexBasis,
    position, top, bottom, left, right,
    display, float, clear, zIndex,
    borderRadius, aspectRatio,
  };
}

/** 从 style 中提取应作用于 <img> 的图片渲染属性 */
function extractImgStyle(style: CSSProperties | undefined): CSSProperties {
  if (!style) return {};
  const {
    objectFit, objectPosition, opacity,
    filter, transform, transformOrigin,
    clipPath, maskImage, maskSize, maskPosition,
    ...rest
  } = style;
  return {
    objectFit, objectPosition, opacity,
    filter, transform, transformOrigin,
    clipPath, maskImage, maskSize, maskPosition,
    // 保留其余未分类样式，防止遗漏
    ...rest,
  };
}

/**
 * 异步懒加载图片组件，带加载动画。
 *
 * 特性：
 * - `loading="lazy"` + `decoding="async"` 避免同时发出大量请求打满浏览器并发池
 * - src 变化时自动重置加载状态，列表/分页切换体验正确
 * - 浏览器缓存导致 `onLoad` 不触发时，通过 `img.complete` 立即显示
 * - 加载中显示 Spin 占位符，加载完成后淡入
 * - 加载失败显示灰色背景，避免布局跳动
 *
 * 用法：直接替换 `<img>` 标签即可，props 与原生 img 基本一致。
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
   * P0: src 变化时重置加载状态。
   * 当列表分页、Tab 切换导致 src 变化时，必须重新显示 loading 占位。
   */
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [imgProps.src]);

  /**
   * P0: 处理浏览器缓存图片 onLoad 不触发的情况。
   * 挂载后检查 img.complete，若图片已缓存则立即显示。
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete) {
      setLoaded(true);
    }
  }, []);

  const wrapperLayout = extractWrapperStyle(style);
  const imgRenderStyle = extractImgStyle(style);

  const wrapperStyle: CSSProperties = {
    ...wrapperStyleBase,
    backgroundColor: error ? errorBg : placeholderBg,
    ...wrapperLayout,
  };

  const imgStyle: CSSProperties = {
    ...imgStyleBase,
    opacity: loaded ? 1 : 0,
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
