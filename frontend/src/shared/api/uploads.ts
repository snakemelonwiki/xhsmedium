import { apiClient } from '@/shared/api/apiClient';

export interface UploadResult {
  ok: boolean;
  url: string;
  key?: string;
  bucket?: string;
  /** 实际落到的驱动：local | oss */
  storage?: 'local' | 'oss';
  fileType?: string;
  originalName?: string;
  size?: number;
}

export interface UploadConfig {
  driver: 'local' | 'oss';
  defaultStorage: 'local' | 'oss';
  bucket: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
  allowedExt: string[];
  session: 'authenticated' | 'anonymous';
}

export interface UploadOptions {
  storage?: 'local' | 'oss';
  keyPrefix?: string;
}

function buildQuery(opts?: UploadOptions): Record<string, string> {
  if (!opts) return {};
  const q: Record<string, string> = {};
  if (opts.storage) q.storage = opts.storage;
  if (opts.keyPrefix) q.keyPrefix = opts.keyPrefix;
  return q;
}

export async function uploadFile(file: File | Blob, bucket: string, opts?: UploadOptions): Promise<UploadResult> {
  const body = new FormData();
  body.set('file', file);
  body.set('bucket', bucket);
  if (opts?.keyPrefix) body.set('keyPrefix', opts.keyPrefix);
  return apiClient.post<UploadResult>('/uploads', body, { query: buildQuery(opts) });
}

export async function getUploadConfig(): Promise<UploadConfig> {
  return apiClient.get<UploadConfig>('/uploads/config');
}
