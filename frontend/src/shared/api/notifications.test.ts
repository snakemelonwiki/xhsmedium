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

import { listNotifications } from './notifications';

describe('notification route hints', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('routes operation collaboration messages to operation collaboration page', async () => {
    getMock.mockResolvedValue({
      items: [{
        id: 'n1',
        typeCode: 'collaboration_requested',
        portType: 'operations',
        relatedType: 'collaboration_task',
        relatedId: 'task-1',
        title: '协同任务',
      }],
    });

    const result = await listNotifications();

    expect(result.items[0].routeHint).toBe('/operation/collaboration?taskId=task-1');
  });

  it('routes operation lead messages back to operation lead board', async () => {
    getMock.mockResolvedValue({
      items: [{
        id: 'n2',
        typeCode: 'customer_added',
        portType: 'operations',
        relatedType: 'lead',
        relatedId: 'lead-1',
        title: '客资已添加',
      }],
    });

    const result = await listNotifications();

    expect(result.items[0].routeHint).toBe('/operation/leads?leadId=lead-1');
  });
});
