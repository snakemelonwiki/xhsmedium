'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  UploadConfigContext,
  defaultFetchUploadConfig,
  type UploadConfigState,
} from '@/shared/contexts/UploadConfigContext';
import type { UploadConfig } from '@/shared/api/uploads';

type ProviderProps = {
  children: React.ReactNode;
  fetcher?: () => Promise<UploadConfig>;
};

export function UploadConfigProvider({ children, fetcher }: ProviderProps) {
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetch = fetcher || defaultFetchUploadConfig;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetch();
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载上传配置失败');
    } finally {
      setLoading(false);
    }
  }, [fetch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: UploadConfigState = { config, loading, error, refresh };
  return <UploadConfigContext.Provider value={value}>{children}</UploadConfigContext.Provider>;
}
