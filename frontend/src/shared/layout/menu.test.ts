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
  }, 30000);
});

describe('academic menu items', () => {
  it('shows today reminders and node reminders for academic roles', async () => {
    globalThis.React = await import('react');
    const { getMenuItemsByRole } = await import('./menu');

    for (const role of ['academic', 'academic_supervisor'] as const) {
      const items = getMenuItemsByRole(role);

      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: '今日待提醒', path: '/academic/today-reminders' }),
          expect.objectContaining({ label: '节点提醒', path: '/academic/reminders' }),
        ]),
      );
    }
  }, 30000);
});

describe('useResponsiveBreakpoint', () => {
  it('is exported from the shared hooks module', async () => {
    const mod = await import('@/shared/hooks/useResponsiveBreakpoint');
    expect(mod.useResponsiveBreakpoint).toBeTypeOf('function');
  });
});
