import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout role="sales" title="销售端">
      {children}
    </AppLayout>
  );
}
