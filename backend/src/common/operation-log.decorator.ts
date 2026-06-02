import { SetMetadata } from '@nestjs/common';

export interface OperationLogMetadata {
  action: string;
  targetType: string;
  getTargetId?: (result: any, args: any[]) => string;
  getDetail?: (result: any, args: any[]) => string;
}

export const OPERATION_LOG_KEY = 'operation_log';
export const OperationLog = (metadata: OperationLogMetadata) =>
  SetMetadata(OPERATION_LOG_KEY, metadata);
