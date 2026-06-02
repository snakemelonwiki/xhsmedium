import { Request } from 'express';

/**
 * 从 Express Request 中提取当前登录用户 ID 的统一入口。
 *
 * 背景（B 端 1.2 P1-03 修复）：
 *   v1.2 之前不同 controller / middleware 读取用户 ID 的字段名不一致：
 *     - 部分用 `session.userId`（由 JwtAuthMiddleware 注入）
 *     - 部分用 `user.sub`（直接读 JWT payload）
 *     - 部分用 `user.id` / `user.userId`
 *   字段名漂移会导致后端在某些调用路径上 userId 解析为空字符串，
 *   进一步引发越权 / 操作日志丢失 actorUserId 等问题。
 *
 * 优先级（从高到低）：
 *   1. session.userId       — JwtAuthMiddleware 注入的标准化字段
 *   2. session.sub          — 兼容少数旧调用链直接挂 JWT payload 到 session
 *   3. session.id           — 兼容早期 session Map 注入的字段
 *   4. user.sub             — NestJS AuthGuard 注入的 JWT payload（标准字段）
 *   5. user.id              — 兼容部分 custom session 实现
 *   6. user.userId          — 兼容部分 legacy code
 *   7. body.actorUserId     — 仅作为 last-resort 兜底（不推荐；body 可被客户端伪造）
 *
 * 返回空字符串时调用方应视为「未登录 / 解析失败」。
 *
 * 用法：
 *   import { getSessionUserId } from '../../common/session.utils';
 *   const userId = getSessionUserId(req);
 */
export function getSessionUserId(req: Request | undefined | null): string {
  if (!req) return '';
  const session = (req as any).session;
  const user = (req as any).user;
  const body = (req as any).body;
  return (
    session?.userId ||
    session?.sub ||
    session?.id ||
    user?.sub ||
    user?.id ||
    user?.userId ||
    body?.actorUserId ||
    ''
  );
}

/**
 * 同 getSessionUserId，但额外回退到 query 参数（仅 GET 请求适用）。
 * 多数 POST 请求应使用 getSessionUserId，避免被 query 污染。
 */
export function getSessionUserIdFromAnySource(req: Request | undefined | null): string {
  if (!req) return '';
  const baseId = getSessionUserId(req);
  if (baseId) return baseId;
  const query = (req as any).query;
  return query?.actorUserId || '';
}

/**
 * 从 request 中获取角色字符串（小写归一化）。
 * 主要给内联 hasRole 校验使用，避免到处写 `String(session?.role || '').toLowerCase()`。
 */
export function getSessionRole(req: Request | undefined | null): string {
  if (!req) return '';
  const session = (req as any).session;
  const user = (req as any).user;
  return String(session?.role || user?.role || '').toLowerCase();
}
