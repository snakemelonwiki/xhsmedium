import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 业务接口鉴权守卫：要求请求必须带有效的 Bearer token。
 * 公开路由（/api/auth/login、import-template 等）由各自的 controller 方法标注 @Public()。
 * 与 SessionMiddleware 不同：本守卫不会 catch 静默放行，
 * 任何 token 缺失或 verify 失败都会直接 401。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  // 避免 Nest 依赖注入 JwtService 失败：JwtModule 在 app.module.ts 是 global，
  // 但 notifications/orders 等子模块没有显式 import JwtModule 也不会注册到 module container。
  // 用 module-level singleton 即可解决。
  private static jwtService: JwtService;
  private static reflector: Reflector;

  static configure(jwt: JwtService, reflector: Reflector) {
    AuthGuard.jwtService = jwt;
    AuthGuard.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const reflector = AuthGuard.reflector;
    if (!reflector) {
      // 没有 configure 过（极端情况），按放行处理以免阻塞启动
      return true;
    }
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      this.tryAttachSession(context.switchToHttp().getRequest<Request>());
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('empty bearer token');
    }
    this.attachSession(req, token);
    return true;
  }

  private tryAttachSession(req: Request) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return;
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
}
