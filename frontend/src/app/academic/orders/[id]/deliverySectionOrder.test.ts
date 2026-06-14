import { describe, expect, it } from 'vitest';

import { getDeliverySectionOrder } from './deliverySectionOrder';

describe('getDeliverySectionOrder', () => {
  it('puts the overview block before base fields when institution acceptance is off', () => {
    expect(getDeliverySectionOrder(false).slice(0, 2)).toEqual(['overview', 'baseAndSubmission']);
  });

  it('removes the overview block when institution acceptance is on', () => {
    expect(getDeliverySectionOrder(true)).not.toContain('overview');
    expect(getDeliverySectionOrder(true)[0]).toBe('baseAndSubmission');
  });
});
