'use client';

import { createContext, useContext } from 'react';
import { getUploadConfig, type UploadConfig } from '@/shared/api/uploads';

export type UploadConfigState = {
  config: UploadConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const UploadConfigContext = createContext<UploadConfigState>({
  config: null,
  loading: false,
  error: null,
  refresh: async () => undefined,
});

export function useUploadConfig(): UploadConfigState {
  return useContext(UploadConfigContext);
}

/** 默认 fetch 实现；用 unit test 可注入 mock */
export const defaultFetchUploadConfig = (): Promise<UploadConfig> => getUploadConfig();
