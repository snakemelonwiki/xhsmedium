import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';

/**
 * 解析请求中的 JWT，填充 req.user 与 req.session。
 * 采用 best-effort 策略：令牌缺失或无效时不拦截，由各控制器自行决定是否要求登录，
 * 避免影响 /api/auth/login 等公开路由。
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // 从 Authorization 头或 query.token 取出 Bearer 令牌
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : String((req.query as any)?.token || '').trim();

    if (!token) {
      return next();
    }

    // 验签并解码，失败时静默放行（视为未登录）
    try {
      const payload: any = this.jwtService.verify(token);
      (req as any).user = payload;
      (req as any).session = {
        userId: payload.sub,
        role: payload.role,
        employeeId: payload.employeeId || null,
        username: payload.username,
      };
    } catch {
      // 令牌无效：不填充 session，交由控制器处理
    }

    next();
  }
}
