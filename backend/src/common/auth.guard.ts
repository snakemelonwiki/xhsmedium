import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// B7 端口隔离（修复于 2026-06-03）：
//   - 3001 端口（OWNER_PORT）仅允许 owner / admin / supervisor
//   - 3000 端口（PORT）禁止 owner 角色
// server.js 在反代之前已经做了一层 O(1) 拦截，这里在路由级做最后防线。
const ALLOWED_OWNER_PORT_ROLES = ['owner', 'admin', 'supervisor'];

// PF-05（修复于 2026-06-04）：
//   撤销 token 缓存：AuthGuard 每请求要查 revoked_tokens 表，
//   为避免对 DB 的高频访问，用 5min in-memory cache 缓存「SHA256(token) → 是否撤销」。
//   5min 窗口足以覆盖一个用户连续操作（即便登出后再次发起请求也会在 5min 内被拦截）；
//   真正关键的「登出立即失效」由 logout() 同步写表 + invalidateRevokedCache() 主动失效缓存保证。
const REVOKED_CACHE_TTL_MS = 5 * 60 * 1000;

interface RevokedCheckFn {
  (token: string): Promise<boolean>;
}

/**
 * 业务接口鉴权守卫：要求请求必须带有效的 Bearer token。
 * 公开路由（/api/auth/login、import-template 等）由各自的 controller 方法标注 @Public()。
 * 与 SessionMiddleware 不同：本守卫不会 catch 静默放行，
 * 任何 token 缺失或 verify 失败都会直接 401。
 *
 * PF-05（2026-06-04）：canActivate 改为 async 以支持查 revoked_tokens 表。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  // 避免 Nest 依赖注入 JwtService 失败：JwtModule 在 app.module.ts 是 global，
  // 但 notifications/orders 等子模块没有显式 import JwtModule 也不会注册到 module container。
  // 用 module-level singleton 即可解决。
  private static jwtService: JwtService;
  private static reflector: Reflector;
  private static configService: ConfigService;

  // PF-05：撤销表查询函数（由 main.ts configure 阶段注入）
  private static revokedCheckFn: RevokedCheckFn | null = null;
  // PF-05：撤销状态 5min 内存缓存
  private static revokedCache: Map<string, { revoked: boolean; expiresAt: number }> = new Map();

  static configure(jwt: JwtService, reflector: Reflector, config?: ConfigService, revokedCheck?: RevokedCheckFn) {
    AuthGuard.jwtService = jwt;
    AuthGuard.reflector = reflector;
    AuthGuard.configService = config as any;
    AuthGuard.revokedCheckFn = revokedCheck || null;
    AuthGuard.revokedCache = new Map();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reflector = AuthGuard.reflector;
    if (!reflector) {
      // 没有 configure 过（极端情况），按放行处理以免阻塞启动
      return true;
    }
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    if (isPublic) {
      this.tryAttachSession(req);
      return true;
    }
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ') && !authHeader.startsWith('bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('empty bearer token');
    }
    // PF-05：撤销表检查必须在 JWT verify 通过后做（避免无效 token 也打 DB）
    this.attachSession(req, token);
    // PF-05：异步查撤销表，命中即 401
    if (await AuthGuard.isTokenRevoked(token)) {
      throw new UnauthorizedException({
        message: 'token 已撤销（已登出）',
        error: 'token_revoked',
      });
    }
    // B7：路由级端口-角色二次校验
    this.assertRolePortMatch(req);
    return true;
  }

  private tryAttachSession(req: Request) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ') && !authHeader.startsWith('bearer ')) return;
    const token = authHeader.substring(7).trim();
    if (!token) return;
    try {
      this.attachSession(req, token);
    } catch {
      // 公开路由 token 无效也放行
    }
  }

  private attachSession(req: Request, token: string) {
    if (!AuthGuard.jwtService) {
      throw new UnauthorizedException('jwt service not configured');
    }
    let payload: any;
    try {
      payload = AuthGuard.jwtService.verify(token);
    } catch (err: any) {
      throw new UnauthorizedException(`invalid or expired token: ${err?.message || 'verify failed'}`);
    }
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('token missing sub/role');
    }
    (req as any).user = payload;
    (req as any).session = {
      userId: payload.sub,
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      employeeId: payload.employeeId ?? null,
    };
  }

  /**
   * B7 路由级端口-角色校验（v1.3 扩展 ALL_ROLES_PORT 3003 分支；2026-06-05 扩展
   *   3002 新 Next.js 前端）：
   *   - x-server-port 头由 server.js proxy 透传（实际访问的端口：3000 / 3001 / 3003）
   *     或 Next.js rewrite 直连时由 main.ts 兜底成 8089。
   *   - 3001（owner 端口）→ role 必须在 ALLOWED_OWNER_PORT_ROLES 内
   *   - 3003（legacy 统一登录入口）→ role !== 'owner'（owner 仍走 3001 / 3002）
   *   - 3002（新 Next.js 前端，全角色）→ 放行所有角色（含 owner）
   *   - 3000（主入口）→ 拒绝 owner
   *   - 其它任意端口（疑似绕过）→ 拒绝 owner
   * 缺 x-server-port 头时放行（开发直连 / 测试环境）。
   */
  private assertRolePortMatch(req: Request) {
    const headerVal = req.headers['x-server-port'];
    if (!headerVal) return; // 本地直连 / 测试环境不强制
    const port = Number(Array.isArray(headerVal) ? headerVal[0] : headerVal);
    if (!port || Number.isNaN(port)) return;

    const session = (req as any).session;
    const role: string = session?.role || '';
    if (!role) return;

    // 默认端口（如果 configService 没注入，按 CLAUDE.md 默认值 3001/3003）
    const cfg = AuthGuard.configService;
    const ownerPort = Number(cfg?.get?.('OWNER_PORT') ?? 3001);
    const allRolesPort = Number(cfg?.get?.('ALL_ROLES_PORT') ?? 3003);
    // 修复 (2026-06-05)：新前端 Next.js 默认 3002（frontend/package.json dev/start 钉死），
    //   owner 也应能从 3002 访问运营/销售/教务/主管等所有页面（与新前端 7 角色入口对齐）。
    //   写死 3002 而非用 env var：与 frontend/package.json 的 `-p 3002` 同步；如未来
    //   Next.js 改端口，需同时调整这里。
    const nextjsPort = 3002;

    if (port === ownerPort) {
      // 命中 owner 端口：必须角色在白名单
      if (!ALLOWED_OWNER_PORT_ROLES.includes(role)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[B7][GUARD] 拒绝角色 ${role} 访问 owner 端口 (port=${port}, path=${req.path})`,
        );
        throw new ForbiddenException({
          message: '该接口仅 owner / admin / supervisor 可访问',
          error: 'forbidden_owner_port_only',
          port,
          role,
        });
      }
    } else if (port === allRolesPort) {
      // v1.3：3003 统一登录入口；除 owner 外都放行，owner 仍走 3001 / 3002
      if (role === 'owner') {
        // eslint-disable-next-line no-console
        console.warn(
          `[v1.3][GUARD] 拒绝 owner 角色访问统一登录入口 (port=${port}, expected=${ownerPort}, path=${req.path})`,
        );
        throw new ForbiddenException({
          message: 'owner 账号必须从 3001 或 3002 端口访问',
          error: 'forbidden_owner_use_3001_or_3002',
          port,
          role,
        });
      }
    } else if (port === nextjsPort) {
      // 修复 (2026-06-05)：3002 新前端 Next.js 入口对全角色放行（含 owner），
      //   不再走 owner 白名单校验。其它非白名单端口（3000/8089 等）仍拒绝 owner。
      return;
    } else {
      // 其它任意端口（3000 主入口、8089 NestJS 直连等）：拒绝 owner 角色
      // 修复说明：原 B7 改进是"非 owner 端口一律拒绝 owner 角色"，本意是防 x-server-port
      //   头伪造绕过。改造后白名单收紧为 3001/3002/3003（其中 3003 仍拒 owner），
      //   其它任何端口（含 8089 直连）都拒绝 owner。
      if (role === 'owner') {
        // eslint-disable-next-line no-console
        console.warn(
          `[B7][GUARD] 拒绝 owner 角色访问非白名单端口 (port=${port}, allowed=[${ownerPort},${nextjsPort}], path=${req.path})`,
        );
        throw new ForbiddenException({
          message: 'owner 账号必须从 3001 或 3002 端口访问',
          error: 'forbidden_owner_use_3001_or_3002',
          port,
          role,
        });
      }
    }
    // 其它端口（如 8089 直连）不强制
  }

  /**
   * PF-05：查询 token 是否被撤销（带 5min 缓存）。
   * 必须在 JWT verify 通过后调用（本方法不重复 verify）。
   * @param token 原始 Bearer token
   * @returns true 表示已撤销
   */
  static async isTokenRevoked(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const cached = AuthGuard.revokedCache.get(tokenHash);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.revoked;
    }
    // 缓存未命中：调注入的 check 函数
    let revoked = false;
    if (AuthGuard.revokedCheckFn) {
      try {
        revoked = await AuthGuard.revokedCheckFn(token);
      } catch (err) {
        // 查撤销表失败：保守按「未撤销」放行（避免单点故障阻塞全站）
        // eslint-disable-next-line no-console
        console.warn('[PF-05] revoked check fn failed, fail-open:', (err as any)?.message || err);
        revoked = false;
      }
    }
    AuthGuard.revokedCache.set(tokenHash, { revoked, expiresAt: now + REVOKED_CACHE_TTL_MS });
    return revoked;
  }

  /**
   * PF-05：登出/撤销时主动失效缓存，保证下一次请求立即拒绝。
   * 注意：这里同时把 cache 标记为 revoked=true 覆盖任何旧值，确保后续 5min 内不需要再查 DB。
   */
  static invalidateRevokedCache(token: string): void {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    AuthGuard.revokedCache.set(tokenHash, { revoked: true, expiresAt: Date.now() + REVOKED_CACHE_TTL_MS });
  }
}
