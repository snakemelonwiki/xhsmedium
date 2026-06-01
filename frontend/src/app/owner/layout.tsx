import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout role="owner" title="总后台">
      {children}
    </AppLayout>
  );
}
