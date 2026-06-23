'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'xhsmedium.adminViewMode';

export type AdminViewMode = 'full' | 'supervisor';

type AdminViewModeContextValue = {
  mode: AdminViewMode;
  setMode: (next: AdminViewMode) => void;
};

const AdminViewModeContext = createContext<AdminViewModeContextValue | undefined>(undefined);

function readInitial(): AdminViewMode {
  if (typeof window === 'undefined') return 'full';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'supervisor' ? 'supervisor' : 'full';
}

export function AdminViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AdminViewMode>('full');

  useEffect(() => {
    setModeState(readInitial());
  }, []);

  const setMode = useCallback((next: AdminViewMode) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const value = useMemo<AdminViewModeContextValue>(() => ({ mode, setMode }), [mode, setMode]);

  return <AdminViewModeContext.Provider value={value}>{children}</AdminViewModeContext.Provider>;
}

export function useAdminViewMode(): AdminViewModeContextValue {
  const ctx = useContext(AdminViewModeContext);
  if (!ctx) {
    return { mode: 'full', setMode: () => {} };
  }
  return ctx;
}
