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

import { ResponsiveActionMenu } from './ResponsiveActionMenu';
import type { ResponsiveActionItem } from './ResponsiveActionMenu';

const buildItems = (): ResponsiveActionItem[] => [
  { key: 'edit', label: '编辑', onClick: vi.fn() },
  { key: 'delete', label: '删除', onClick: vi.fn(), danger: true },
  { key: 'share', label: '分享', onClick: vi.fn() },
];

describe('ResponsiveActionMenu', () => {
  beforeEach(() => {
    Object.assign(mockBreakpoint, { isMobile: false, isTablet: false, isDesktop: true, width: 1280 });
  });

  it('is a named function export', () => {
    expect(ResponsiveActionMenu).toBeDefined();
    expect(typeof ResponsiveActionMenu).toBe('function');
  });

  describe('desktop (isMobile false)', () => {
    it('renders a trigger button wrapped in a Dropdown trigger', () => {
      const markup = renderToStaticMarkup(
        createElement(ResponsiveActionMenu, {
          triggerLabel: '操作',
          mobileTitle: '快捷操作',
          items: buildItems(),
        }),
      );

      expect(markup).toContain('ant-btn');
      // desktop Dropdown wraps the button, adding ant-dropdown-trigger class
      expect(markup).toContain('ant-dropdown-trigger');
    });

    it('renders the trigger label inside the button', () => {
      const markup = renderToStaticMarkup(
        createElement(ResponsiveActionMenu, {
          triggerLabel: '操作',
          mobileTitle: '快捷操作',
          items: buildItems(),
        }),
      );

      // Ant Design 5 SSR may insert spaces between CJK characters;
      // strip whitespace to reliably match the label text
      expect(markup.replace(/\s/g, '')).toContain('操作');
    });

    it('renders without throwing when items have onClick callbacks', () => {
      const items = buildItems();

      expect(() => {
        renderToStaticMarkup(
          createElement(ResponsiveActionMenu, {
            triggerLabel: '更多',
            mobileTitle: '快捷操作',
            items,
          }),
        );
      }).not.toThrow();
    });
  });

  describe('mobile (isMobile true)', () => {
    it('renders a trigger button without Dropdown wrapper', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveActionMenu, {
          triggerLabel: '操作',
          mobileTitle: '快捷操作',
          items: buildItems(),
        }),
      );

      expect(markup).toContain('ant-btn');
      // mobile path does NOT use Dropdown, so ant-dropdown-trigger is absent
      expect(markup).not.toContain('ant-dropdown-trigger');
    });

    it('renders the trigger label inside the button', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const markup = renderToStaticMarkup(
        createElement(ResponsiveActionMenu, {
          triggerLabel: '操作',
          mobileTitle: '快捷操作',
          items: buildItems(),
        }),
      );

      // Ant Design 5 SSR may insert spaces between CJK characters;
      // strip whitespace to reliably match the label text
      expect(markup.replace(/\s/g, '')).toContain('操作');
    });

    it('renders without throwing when items have onClick callbacks', () => {
      Object.assign(mockBreakpoint, { isMobile: true, isTablet: false, isDesktop: false, width: 375 });

      const items = buildItems();

      expect(() => {
        renderToStaticMarkup(
          createElement(ResponsiveActionMenu, {
            triggerLabel: '更多',
            mobileTitle: '快捷操作',
            items,
          }),
        );
      }).not.toThrow();
    });
  });
});
