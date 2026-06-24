'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { readStoredUser, type AppUser } from '@/shared/auth/auth';
import { AppLayout } from '@/shared/layout/AppLayout';

export default function AcademicLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | undefined>();

  useEffect(() => {
    setUser(readStoredUser());
  }, []);

  const role = user?.role;

  // admin / owner / supervisor 进入教务端 URL 时，按角色显示对应的主管/总后台菜单
  if (role === 'supervisor') {
    return (
      <AppLayout role="admin" title="主管端" viewRole="supervisor">
        {children}
      </AppLayout>
    );
  }

  if (role === 'admin' || role === 'owner') {
    return (
      <AppLayout role="admin" title="总后台">
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
