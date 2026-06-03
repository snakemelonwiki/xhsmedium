/**
 * Imports 模块共享常量与类型。
 * 抽出来避免 imports.service ↔ imports.processor 之间的循环依赖。
 */

export const IMPORT_QUEUE_NAME = 'imports';

export type ImportJobType =
  | 'leads-import'
  | 'posts-import'
  | 'leads-paste'
  | 'posts-paste';

export interface ImportJobData {
  taskId: string;
  type: ImportJobType;
  userId: string;
  employeeId: string;
  payload: Record<string, any>;
}
