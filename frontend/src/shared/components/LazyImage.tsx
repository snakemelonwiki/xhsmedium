'use client';

import { Spin } from 'antd';
import { useState, useCallback } from 'react';
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

/**
 * 异步懒加载图片组件，带加载动画。
 *
 * 特性：
 * - `loading="lazy"` + `decoding="async"` 避免同时发出大量请求打满浏览器并发池
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(true);
    setError(true);
  }, []);

  const wrapperStyle: CSSProperties = {
    ...wrapperStyleBase,
    backgroundColor: error ? errorBg : placeholderBg,
    ...style,
  };

  const imgStyle: CSSProperties = {
    ...imgStyleBase,
    opacity: loaded ? 1 : 0,
    ...style,
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
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        style={imgStyle}
      />
    </div>
  );
}
