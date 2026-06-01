import { Request } from 'express';

/**
 * 操作日志标准动作枚举。
 * 命名规范：snake_case。统一在 controller 层调用 operationLogsService.log({ action, ... })。
 *
 * 历史注意：早期 leads.service 写入 'lead_status_update'（业务自定义），
 * 已存在的调用点保留原值；本枚举仅用于本次新增的 controller 层日志，
 * 避免改动已落库的历史 action 字符串。
 */
export enum OPERATION_LOG_ACTIONS {
  LOGIN = 'login',
  LOGOUT = 'logout',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DISABLE = 'disable',
  ASSIGN = 'assign',
  REASSIGN = 'reassign',
  STATUS_CHANGE = 'status_change',
  EXPORT_CREATE = 'export_create',
  EXPORT_DOWNLOAD = 'export_download',
  VIEW_SENSITIVE = 'view_sensitive',
  HANDOVER = 'handover',
  ABNORMAL_CREATE = 'abnormal_create',
  ABNORMAL_CLOSE = 'abnormal_close',
}

/**
 * 操作日志目标对象类型。
 * 命名规范：snake_case，需与 operation_logs.target_type 落库字符串一致。
 */
export enum OPERATION_LOG_TARGET_TYPES {
  USER = 'user',
  EMPLOYEE = 'employee',
  ACCOUNT = 'account',
  POST = 'post',
  LEAD = 'lead',
  COLLABORATION = 'collaboration_task',
  ORDER = 'order',
  ORDER_FOLLOW = 'order_follow_record',
  ABNORMAL_FEEDBACK = 'abnormal_feedback',
  EXPORT_TASK = 'export_task',
  NOTIFICATION = 'notification',
}

/**
 * 从 Express Request 提取客户端 IP，优先读取 x-forwarded-for（多级代理场景）。
 * 兼容 req.ip、req.socket.remoteAddress 兜底。
 */
export function parseIp(req: Request | undefined | null): string | undefined {
  if (!req) return undefined;
  const xff = (req.headers?.['x-forwarded-for'] as string | undefined) || '';
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = (req.headers?.['x-real-ip'] as string | undefined);
  if (realIp) return realIp.trim();
  const fromSocket = (req.socket as any)?.remoteAddress;
  if (fromSocket) return fromSocket;
  return (req as any).ip || undefined;
}

/**
 * 工具：把对象序列化成可落库的 detail 字符串。
 * 失败时回退到 String(value)，保证主流程永远能记录到内容。
 */
export function stringifyDetail(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
