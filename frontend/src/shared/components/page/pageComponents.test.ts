import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState, FilterBar, PageHeaderBar, PortHomeCard } from './index';

describe('page display components', () => {
  it('renders a page header with its description and actions', () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeaderBar, {
        title: '订单管理',
        description: '查看并处理全部订单',
        actions: createElement('button', null, '新增订单'),
      }),
    );

    expect(markup).toContain('订单管理');
    expect(markup).toContain('查看并处理全部订单');
    expect(markup).toContain('新增订单');
  });

  it('renders filter controls and an optional extra action', () => {
    const markup = renderToStaticMarkup(
      createElement(
        FilterBar,
        { extra: createElement('button', null, '重置') },
        createElement('input', { placeholder: '搜索客户' }),
      ),
    );

    expect(markup).toContain('搜索客户');
    expect(markup).toContain('重置');
  });

  it('renders a home statistic card', () => {
    const markup = renderToStaticMarkup(
      createElement(PortHomeCard, {
        title: '今日客资',
        value: 18,
        suffix: '条',
      }),
    );

    expect(markup).toContain('今日客资');
    expect(markup).toContain('18');
    expect(markup).toContain('条');
  });

  it('renders an empty state with a custom action', () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyState, {
        description: '暂无订单',
        action: createElement('button', null, '创建订单'),
      }),
    );

    expect(markup).toContain('暂无订单');
    expect(markup).toContain('创建订单');
  });
});
