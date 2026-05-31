import type { ReactNode } from 'react';

import { AppLayout } from '@/shared/layout/AppLayout';

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout role="academic" title="教务端">
      {children}
    </AppLayout>
  );
}
