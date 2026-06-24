'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { readStoredUser, type AppUser } from '@/shared/auth/auth';
import { AppLayout } from '@/shared/layout/AppLayout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | undefined>();

  useEffect(() => {
    setUser(readStoredUser());
  }, []);

  const isSupervisor = user?.role === 'supervisor';
  return (
    <AppLayout
      role="admin"
      title={isSupervisor ? '主管端' : '总后台'}
      viewRole={isSupervisor ? 'supervisor' : undefined}
    >
      {children}
    </AppLayout>
  );
}
