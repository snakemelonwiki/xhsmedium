import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: {
      get: getMock,
      post: postMock,
    },
  };
});

import { confirmLeadSource } from './leads';

describe('lead source confirm API helper', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('confirms a pending lead source with matched post and operator', async () => {
    postMock.mockResolvedValue({ ok: true });

    await confirmLeadSource({
      leadId: 'lead-2',
      matchedPostId: 'post-9',
      sourceOperatorId: 'employee-3',
    });

    expect(postMock).toHaveBeenCalledWith('/leads/lead-2/source-confirm', {
      matchedPostId: 'post-9',
      sourceOperatorId: 'employee-3',
    });
  });
});
