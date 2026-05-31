import { apiClient } from '@/shared/api/apiClient';

export interface UploadResult {
  ok: boolean;
  url: string;
  fileId?: string;
  fileType?: string;
  originalName?: string;
}

export async function uploadFile(file: File, bucket: string): Promise<UploadResult> {
  const body = new FormData();
  body.set('file', file);
  body.set('bucket', bucket);
  return apiClient.post<UploadResult>('/uploads', body);
}
