import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

export default function OperationLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout role="operation" title="运营端">
      {children}
    </AppLayout>
  );
}
