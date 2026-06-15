'use client';

import React from 'react';

import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';

export type ResponsiveDataViewProps<T> = {
  table: React.ReactNode;
  mobileList: (items: T[]) => React.ReactNode;
  items: T[];
  empty?: React.ReactNode;
};

export function ResponsiveDataView<T>({
  table,
  mobileList,
  items,
  empty,
}: ResponsiveDataViewProps<T>) {
  const { isMobile } = useResponsiveBreakpoint();

  if (isMobile && items.length > 0) {
    return <>{mobileList(items)}</>;
  }

  if (isMobile && items.length === 0) {
    return <>{empty ?? null}</>;
  }

  return <>{table}</>;
}
