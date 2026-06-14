import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InteractionMetricsGrid } from './InteractionMetricsGrid';

describe('InteractionMetricsGrid', () => {
  it('renders the four interaction metrics in a fixed two-column grid', () => {
    const markup = renderToStaticMarkup(
      createElement(InteractionMetricsGrid, {
        likes: 12,
        comments: 3,
        favorites: 8,
        shares: 2,
      }),
    );

    expect(markup).toContain('grid-template-columns:repeat(2, minmax(0, 1fr))');
    expect(markup).toContain('grid-template-rows:repeat(2, auto)');
    expect(markup).toContain('grid-auto-flow:column');
    expect(markup).toContain('赞 12');
    expect(markup).toContain('评 3');
    expect(markup).toContain('藏 8');
    expect(markup).toContain('转 2');
  });
});
