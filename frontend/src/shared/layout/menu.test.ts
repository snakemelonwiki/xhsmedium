import { describe, expect, it } from 'vitest';

describe('role menu items', () => {
  it('shows learning board and gallery entries for supervisor-side roles', async () => {
    globalThis.React = await import('react');
    const { getMenuItemsByRole } = await import('./menu');

    for (const role of ['admin', 'owner', 'supervisor'] as const) {
      const items = getMenuItemsByRole(role);

      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: '学习榜单', path: '/admin/rankings/study' }),
          expect.objectContaining({ label: '作品广场', path: '/admin/gallery' }),
        ]),
      );
    }
  }, 10000);
});
