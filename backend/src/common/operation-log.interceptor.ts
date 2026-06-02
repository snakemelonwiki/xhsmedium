import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OperationLogsService } from '../modules/operation-logs/operation-logs.service';
import { OPERATION_LOG_KEY, OperationLogMetadata } from './operation-log.decorator';

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly operationLogsService: OperationLogsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const metadata = this.reflector.get<OperationLogMetadata>(
      OPERATION_LOG_KEY,
      context.getHandler(),
    );

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.session?.userId || '';
    const ip = request.ip || request.connection?.remoteAddress || '';

    return next.handle().pipe(
      tap(async (result) => {
        try {
          const targetId = metadata.getTargetId
            ? metadata.getTargetId(result, request.body)
            : result?.id || '';
          const detail = metadata.getDetail
            ? metadata.getDetail(result, request.body)
            : null;

          await this.operationLogsService.log({
            userId,
            action: metadata.action,
            targetType: metadata.targetType,
            targetId: String(targetId),
            detail,
            ip,
          });
        } catch (err) {
          console.error('Failed to log operation:', err);
        }
      }),
    );
  }
}
