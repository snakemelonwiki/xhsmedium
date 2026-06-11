import { Response } from 'express';

/**
 * 统一成功响应
 */
export function sendSuccess(res: Response, data?: any, statusCode = 200) {
  return res.status(statusCode).json({
    ok: true,
    ...data,
  });
}

/**
 * 统一失败响应
 */
export function sendError(res: Response, message: string, statusCode = 500, extra?: Record<string, any>) {
  return res.status(statusCode).json({
    ok: false,
    message,
    ...extra,
  });
}

/**
 * 统一分页响应
 */
export function sendPaginated(res: Response, items: any[], total: number, limit: number, offset: number) {
  return res.status(200).json({
    ok: true,
    items,
    total,
    limit,
    offset,
  });
}
