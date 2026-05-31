import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: {
      get: getMock,
    },
  };
});

import { listAssignableSalesUsers } from './catalog';

describe('catalog API helpers', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('loads active staff accounts for the sales assignment selector', async () => {
    getMock.mockResolvedValue({
      items: [
        { id: 'user-1', username: 'sales-a', status: 'active' },
        { id: 'user-2', username: 'disabled', status: 'disabled' },
      ],
      total: 2,
      limit: 200,
      offset: 0,
    });

    await expect(listAssignableSalesUsers()).resolves.toEqual([
      { id: 'user-1', name: 'sales-a', employeeId: undefined },
    ]);

    expect(getMock).toHaveBeenCalledWith('/users/staff', {
      query: { limit: 200, offset: 0 },
    });
  });
});
