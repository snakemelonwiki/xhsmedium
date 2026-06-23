import { describe, expect, it } from 'vitest';

import { ACCOUNT_ANALYSIS_LEGEND } from './account-analysis';

describe('ACCOUNT_ANALYSIS_LEGEND', () => {
  it('uses the required account analysis display labels', () => {
    expect(ACCOUNT_ANALYSIS_LEGEND.leadPost.text).toBe('获客帖');
    expect(ACCOUNT_ANALYSIS_LEGEND.discussionPost.text).toBe('讨论帖');
    expect(ACCOUNT_ANALYSIS_LEGEND.personaPost.text).toBe('人设帖');
  });
});
