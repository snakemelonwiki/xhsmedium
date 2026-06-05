import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthGuard } from './auth.guard';

@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // 优先从 Authorization 头取 Bearer 令牌; 浏览器 <a href> 导航无法设置
    // Authorization 头, 兜底支持 ?token=xxx(主要用于导出/导入等文件下载直链)。
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const queryToken = (req.query as any)?.token;
      if (typeof queryToken === 'string' && queryToken.trim()) {
        token = queryToken.trim();
      }
    }
    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        // PF-05（2026-06-04）：中间件也要查撤销表。
        // 否则 JWT verify 通过但 logout 过的 token 仍会注入 payload，
        // 那些走 NestMiddleware 而不走 @UseGuards(AuthGuard) 的端点
        // （如 /api/auth/me）会泄露已登出用户信息。
        const revoked = await AuthGuard.isTokenRevoked(token);
        if (revoked) {
          return res.status(401).json({ message: 'token 已撤销（已登出）', error: 'token_revoked' });
        }
        // 将JWT payload附加到req.user
        (req as any).user = payload;
        // 同时附加到req.session以兼容现有代码
        (req as any).session = {
          userId: payload.sub,
          id: payload.sub,
          username: payload.username,
          role: payload.role,
          employeeId: payload.employeeId,
        };
      } catch (err) {
        // Token无效，继续但不附加用户信息
      }
    }
    next();
  }
}
