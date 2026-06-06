import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';

import { QuickRangePicker, RANGE_PRESETS_FULL } from './index';

describe('QuickRangePicker', () => {
  it('renders all 6 default preset labels in buttons mode', () => {
    const markup = renderToStaticMarkup(
      createElement(QuickRangePicker, { value: null, onChange: () => {} }),
    );
    expect(markup).toContain('近 1 天');
    expect(markup).toContain('近 7 天');
    expect(markup).toContain('近 30 天');
    expect(markup).toContain('近 90 天');
    expect(markup).toContain('近 1 年');
    expect(markup).toContain('近 3 年');
  });

  it('renders select mode using given presets (RANGE_PRESETS_FULL has 12 items)', () => {
    const markup = renderToStaticMarkup(
      createElement(QuickRangePicker, {
        value: null,
        onChange: () => {},
        variant: 'select',
        presets: RANGE_PRESETS_FULL,
      }),
    );
    // select 模式用 antd Select,选项通过 options 传入,SSR 不会逐个 label 渲染到 markup
    // 但 placeholder 会出现
    expect(markup).toContain('选择时间段');
    // 不会渲染 buttons
    expect(markup).not.toContain('ant-btn');
  });

  it('renders no preset buttons when presets=[]', () => {
    const markup = renderToStaticMarkup(
      createElement(QuickRangePicker, { value: null, onChange: () => {}, presets: [] }),
    );
    expect(markup).not.toContain('近 7 天');
  });

  it('highlights the preset whose range matches the current value', () => {
    const now = dayjs('2026-06-06T10:30:00.000Z');
    const value = { start: now.subtract(7, 'day'), end: now };
    const markup = renderToStaticMarkup(
      createElement(QuickRangePicker, { value, onChange: () => {} }),
    );
    const segments = markup.split('近 7 天');
    expect(segments.length).toBe(2);
    const headBefore = segments[0].slice(-200);
    expect(headBefore).toContain('ant-btn-primary');
  });

  it('does not highlight any preset when value is a custom range', () => {
    const now = dayjs('2026-06-06T10:30:00.000Z');
    const value = { start: now.subtract(15, 'day'), end: now };
    const markup = renderToStaticMarkup(
      createElement(QuickRangePicker, { value, onChange: () => {} }),
    );
    expect(markup.match(/ant-btn-primary/g)).toBeNull();
  });
});
