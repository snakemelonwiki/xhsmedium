import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: {
      get: getMock,
      put: putMock,
    },
  };
});

import {
  getLearningBoardThresholds,
  updateLearningBoardThresholds,
} from './learning-board';

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
});

describe('learning board API', () => {
  it('loads learning board threshold config', async () => {
    getMock.mockResolvedValue({ minLeads: 6, minTraffic: 9000 });

    await expect(getLearningBoardThresholds()).resolves.toEqual({ minLeads: 6, minTraffic: 9000 });
    expect(getMock).toHaveBeenCalledWith('/posts/learning-board/thresholds');
  });

  it('updates learning board threshold config', async () => {
    putMock.mockResolvedValue({ minLeads: 8, minTraffic: 12000 });

    await expect(updateLearningBoardThresholds({ minLeads: 8, minTraffic: 12000 })).resolves.toEqual({
      minLeads: 8,
      minTraffic: 12000,
    });
    expect(putMock).toHaveBeenCalledWith('/posts/learning-board/thresholds', {
      minLeads: 8,
      minTraffic: 12000,
    });
  });
});
