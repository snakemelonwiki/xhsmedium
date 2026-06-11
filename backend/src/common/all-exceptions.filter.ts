import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器 — 拦截所有未被捕获的异常，统一返回格式：
 * { ok: false, error: string, message: string, statusCode: number, ...extra }
 *
 * - HttpException: 提取 status + response 中的 message / 额外字段
 * - 其他异常（Error / QueryFailedError 等）: 500 + 通用提示，不泄露内部细节
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'InternalServerError';
    let message = '服务器内部错误，请稍后重试';
    let extra: Record<string, any> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      // HttpException.getResponse() 可能是 string 或 object
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message ?? message;
        error = obj.error ?? exception.name;
        // 保留业务额外字段（如 locked: true 等）
        const { message: _m, error: _e, statusCode: _s, ...rest } = obj;
        extra = rest;
      }
    } else {
      // 非 HttpException：记录完整堆栈，返回通用错误
      console.error(
        '\x1b[31m[AllExceptionsFilter]\x1b[0m',
        request.method,
        request.url,
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const body: Record<string, any> = {
      ok: false,
      error,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      statusCode,
      ...extra,
    };

    response.status(statusCode).json(body);
  }
}
