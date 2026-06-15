import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockBreakpoint = vi.hoisted(() => ({
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  width: 1280,
}));

vi.mock('@/shared/hooks/useResponsiveBreakpoint', () => ({
  useResponsiveBreakpoint: () => mockBreakpoint,
}));

import { ResponsiveDataView } from './ResponsiveDataView';

describe('ResponsiveDataView', () => {
  beforeEach(() => {
    Object.assign(mockBreakpoint, { isMobile: false, isTablet: false, isDesktop: true, width: 1280 });
  });

  it('is a named function export', () => {
    expect(typeof ResponsiveDataView).toBe('function');
  });

  describe('desktop', () => {
    it('renders the table prop content regardless of items', () => {
      const markup = renderToStaticMarkup(
        createElement(ResponsiveDataView, {
          table: createElement('table', null, '表格数据'),
          mobileList: () => createElement('div', null, '移动列表'),
          items: ['a', 'b', 'c'] as string[],
        }),
      );

      expect(markup).toContain('表格数据');
      expect(markup).not.toContain('移动列表');
    });
  });

  describe('mobile', () => {
    it('with items renders the mobileList output', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveDataView, {
          table: createElement('table', null, '表格数据'),
          mobileList: (items: string[]) => createElement('ul', null, items.map((it) => createElement('li', { key: it }, it))),
          items: ['苹果', '香蕉'],
        }),
      );

      expect(markup).toContain('苹果');
      expect(markup).toContain('香蕉');
      expect(markup).not.toContain('表格数据');
    });

    it('with empty items renders the empty prop', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveDataView, {
          table: createElement('table', null, '表格数据'),
          mobileList: () => createElement('div', null, '移动列表'),
          items: [] as string[],
          empty: createElement('div', null, '暂无内容'),
        }),
      );

      expect(markup).toContain('暂无内容');
      expect(markup).not.toContain('表格数据');
      expect(markup).not.toContain('移动列表');
    });

    it('with empty items and no empty prop renders nothing (null)', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveDataView, {
          table: createElement('table', null, '表格数据'),
          mobileList: () => createElement('div', null, '移动列表'),
          items: [] as string[],
        }),
      );

      expect(markup).not.toContain('表格数据');
      expect(markup).not.toContain('移动列表');
    });
  });
});
