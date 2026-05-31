import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout role="admin" title="主管端">
      {children}
    </AppLayout>
  );
}
