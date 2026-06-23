'use client';

import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { useAdminViewMode } from '@/app/admin/_shell/AdminViewModeContext';

export default function AcademicLayout({ children }: { children: ReactNode }) {
  const { mode } = useAdminViewMode();
  const isSupervisorView = mode === 'supervisor';

  // 主管视图下：使用 admin 菜单（filter by supervisor），保持与 admin/layout.tsx 一致的体验
  if (isSupervisorView) {
    return (
      <AppLayout role="admin" title="主管端 · 运营主管视图" viewRole="supervisor">
        {children}
      </AppLayout>
    );
  }

  return (
    <AppLayout role="academic" title="教务端">
      {children}
    </AppLayout>
  );
}
