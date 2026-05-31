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

import {
  bindPassiveLead,
  confirmLeadSource,
  createPassiveLead,
  listPassiveLeadCandidates,
} from './leads';

describe('passive lead API helpers', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('loads passive lead candidates with paging query', async () => {
    getMock.mockResolvedValue({
      items: [{ id: 7, nickname: '小王', contactInfo: 'wx-1', platform: 'xhs' }],
      total: 1,
      limit: 20,
      offset: 0,
    });

    await expect(listPassiveLeadCandidates({ nickname: '小王' })).resolves.toEqual({
      items: [{ id: '7', nickname: '小王', contactInfo: 'wx-1', platform: 'xhs' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    expect(getMock).toHaveBeenCalledWith('/leads/passive/candidates', {
      query: { nickname: '小王', limit: 20, offset: 0 },
    });
  });

  it('binds a passive lead with contact and sales feedback', async () => {
    postMock.mockResolvedValue({ ok: true });

    await bindPassiveLead({ leadId: 'lead-1', contact: 'wx-1', salesFeedback: '已通过' });

    expect(postMock).toHaveBeenCalledWith('/leads/passive/bind', {
      leadId: 'lead-1',
      contact: 'wx-1',
      salesFeedback: '已通过',
    });
  });

  it('creates a passive lead with the submitted form values', async () => {
    postMock.mockResolvedValue({ ok: true });

    await createPassiveLead({
      contact: '13800000000',
      nickname: '新客',
      platform: 'xhs',
      salesFeedback: '主动添加',
    });

    expect(postMock).toHaveBeenCalledWith('/leads/passive/new', {
      contact: '13800000000',
      nickname: '新客',
      platform: 'xhs',
      salesFeedback: '主动添加',
    });
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
