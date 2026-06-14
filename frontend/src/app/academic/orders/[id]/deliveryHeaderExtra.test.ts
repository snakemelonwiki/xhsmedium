import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DeliveryHeaderExtra } from './deliveryHeaderExtra';

describe('DeliveryHeaderExtra', () => {
  it('renders the delivery hint together with the institution-accepted toggle slot', () => {
    const markup = renderToStaticMarkup(
      createElement(DeliveryHeaderExtra, {
        checked: true,
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('保存后同步到订单交付资料。');
    expect(markup).toContain('机构接单');
  });
});
