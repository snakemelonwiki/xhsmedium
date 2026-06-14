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

import { getPlazaConfig, updatePlazaConfig } from './plaza-config';

describe('plaza-config API', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('normalizes the plaza config response', async () => {
    getMock.mockResolvedValue({
      config: {
        marketingMinLeads: '2',
        personaMinTraffic: '12000',
        minLeads: '',
        minTraffic: undefined,
      },
    });

    await expect(getPlazaConfig()).resolves.toEqual({
      minLeads: 0,
      minTraffic: 0,
      marketingMinLeads: 2,
      personaMinTraffic: 12000,
    });
    expect(getMock).toHaveBeenCalledWith('/plaza-config');
  });

  it('posts display condition updates to the plaza config API', async () => {
    postMock.mockResolvedValue({ ok: true });

    await updatePlazaConfig({
      minLeads: 0,
      minTraffic: 0,
      marketingMinLeads: 1,
      personaMinTraffic: 10000,
    });

    expect(postMock).toHaveBeenCalledWith('/plaza-config', {
      minLeads: 0,
      minTraffic: 0,
      marketingMinLeads: 1,
      personaMinTraffic: 10000,
    });
  });
});
