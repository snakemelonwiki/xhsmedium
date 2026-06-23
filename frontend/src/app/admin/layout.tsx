'use client';

import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

import { useAdminViewMode } from './_shell/AdminViewModeContext';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { mode } = useAdminViewMode();
  const isSupervisorView = mode === 'supervisor';
  return (
    <AppLayout
      role="admin"
      title={isSupervisorView ? '主管端 · 运营主管视图' : '主管端'}
      viewRole={isSupervisorView ? 'supervisor' : undefined}
    >
      {children}
    </AppLayout>
  );
}
