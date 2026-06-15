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

import { ResponsiveTabsSwitcher } from './ResponsiveTabsSwitcher';

const threeItems = [
  { key: 'tab1', label: '标签一' },
  { key: 'tab2', label: '标签二' },
  { key: 'tab3', label: '标签三' },
];

const fiveItems = [
  { key: 'a', label: '选项A' },
  { key: 'b', label: '选项B' },
  { key: 'c', label: '选项C' },
  { key: 'd', label: '选项D' },
  { key: 'e', label: '选项E' },
];

describe('ResponsiveTabsSwitcher', () => {
  beforeEach(() => {
    Object.assign(mockBreakpoint, { isMobile: false, isTablet: false, isDesktop: true, width: 1280 });
  });

  it('is a named function export', () => {
    expect(ResponsiveTabsSwitcher).toBeDefined();
    expect(typeof ResponsiveTabsSwitcher).toBe('function');
  });

  describe('desktop (isMobile false)', () => {
    it('renders Tabs component with ant-tabs class', () => {
      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: threeItems,
          activeKey: 'tab1',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('ant-tabs');
      expect(markup).toContain('标签一');
    });

    it('renders all tab labels', () => {
      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: threeItems,
          activeKey: 'tab1',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('标签一');
      expect(markup).toContain('标签二');
      expect(markup).toContain('标签三');
    });
  });

  describe('mobile with <= 3 items', () => {
    it('renders Segmented component with ant-segmented class', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: threeItems,
          activeKey: 'tab1',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('ant-segmented');
      expect(markup).toContain('标签一');
    });

    it('renders all option labels inside the segmented control', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: threeItems,
          activeKey: 'tab2',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('ant-segmented');
      expect(markup).toContain('标签一');
      expect(markup).toContain('标签二');
      expect(markup).toContain('标签三');
    });
  });

  describe('mobile with > 3 items', () => {
    it('renders Select component with ant-select class', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: fiveItems,
          activeKey: 'a',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('ant-select');
    });

    it('shows the selected item label as placeholder text', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveTabsSwitcher, {
          items: fiveItems,
          activeKey: 'c',
          onChange: vi.fn(),
        }),
      );

      expect(markup).toContain('ant-select');
      expect(markup).toContain('选项C');
    });
  });

  describe('onChange callback', () => {
    it('on desktop Tabs receives onChange and does not throw when rendered', () => {
      Object.assign(mockBreakpoint, { isMobile: false, isTablet: false, isDesktop: true, width: 1280 });

      expect(() => {
        renderToStaticMarkup(
          createElement(ResponsiveTabsSwitcher, {
            items: threeItems,
            activeKey: 'tab1',
            onChange: vi.fn(),
          }),
        );
      }).not.toThrow();
    });

    it('on mobile Segmented receives onChange and does not throw when rendered', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      expect(() => {
        renderToStaticMarkup(
          createElement(ResponsiveTabsSwitcher, {
            items: threeItems,
            activeKey: 'tab1',
            onChange: vi.fn(),
          }),
        );
      }).not.toThrow();
    });

    it('on mobile Select receives onChange and does not throw when rendered', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      expect(() => {
        renderToStaticMarkup(
          createElement(ResponsiveTabsSwitcher, {
            items: fiveItems,
            activeKey: 'a',
            onChange: vi.fn(),
          }),
        );
      }).not.toThrow();
    });
  });
});
